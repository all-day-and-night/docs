# LG 디스플레이 메일 AI Agent

::: info 프로젝트 개요
- **기간**: 2025.01 ~ 2025.06 (6개월)
- **역할**: System Architect, Backend Developer
- **팀 구성**: Phase 1 — PM 1명 (요구사항 분석), SE 1명 (본인, 기술 검토·아키텍처 설계·구현) / Phase 2 (파일요약, 성능개선, 부하테스트, 운영)
- **소속**: LG CNS → LG 디스플레이 (고객사)
- **인프라**: On-Premise (WebToB + Jeus WAS 기반)
- **수상**: LG 계열사 AI Best Practice 사례 선정
:::

---

## 배경 및 목적

LG 디스플레이 사내 메일 시스템에 LLM 기반 AI 기능 추가.  
PM이 현업 인터뷰를 통해 요구사항을 수집하면, 본인이 기술 검토 및 아키텍처 설계를 전담하여 구현 방향을 확정했다.  
메일 요약, 첨부파일 요약, 초안 생성, 멀티턴 대화 기능을 구현하며, 아키텍처 설계부터 구현, 성능 개선, 부하 테스트까지 담당했다.

---

## 프로젝트 단계

| 단계 | 범위 |
|------|------|
| Phase 1 | 아키텍처 설계, 메일 요약, 초안 생성 |
| Phase 2 | 파일 요약, 성능 개선, 유지보수 |

---

## 기술 스택 결정 과정

### FastAPI + LangChain 제안 → 기각

LLM API 호출 중심의 I/O Bound 기능이 대부분이었기 때문에, 비동기 처리에 적합한 **FastAPI + LangChain** 도입을 제안했다.  
그러나 기존 인프라 통합 관리 이유로 기각되었고, 고객사 **WebToB + JEUS** 환경에 맞춰 **Java Spring**으로 기술 스택이 결정됐다.

### JEUS 8.5 환경에 맞춘 Spring Boot 구성

Spring Boot 자동 설정 편의를 유지하면서 고객사 표준인 **JEUS 8.5 서블릿 컨테이너**에서 동작하도록 다음과 같이 구성했다.

JEUS 8.5 환경에서는 WebFlux 기반의 Non-blocking Runtime을 운영 표준으로 사용할 수 없었고, Java Virtual Thread도 적용할 수 없었다.  
또한 FastAPI 별도 서버 구성이 인프라 정책상 불가했기 때문에, 기존 Spring MVC + JEUS 구조 안에서 WAS 요청 스레드 점유 시간을 줄이는 방식으로 설계해야 했다.

- **WAR 패키징** — 내장 Tomcat 및 내장 커넥션 풀 제거 → `provided` 스코프 설정으로 JEUS 서블릿 컨테이너에서 실행
- **Maven Profile** — 로컬·운영 환경 분리 → 개발 편의 확보
- **비동기 Polling 구조 설계** — 요청 수신 즉시 `taskId`를 반환하고, LLM API 호출은 별도 `ThreadPoolTaskExecutor`에서 처리 → 클라이언트가 Polling으로 완료 상태 조회

---

## 아키텍처

```
메일 클라이언트 UI
    ↓ REST 요청
Spring REST API (Jeus WAS)
    ↓ 비동기 submit → taskId 반환
Async ThreadPoolExecutor
    ├→ RestTemplate → Exaone     (한국어 메일 요약 / 초안)
    ├→ RestTemplate → Llama 3    (멀티턴 대화)
    ├→ RestTemplate → Gemma      (범용 요약 보조)
    └→ Docling (파일 파싱) → OCR API (이미지 추출)
        → 결과 저장 → DB
        → 시스템 프롬프트 캐싱 → Caffeine Cache

클라이언트: taskId로 Polling → 완료 확인
Jenkins → CI/CD → Jeus WAS 배포
```

---

## LLM 기능 목록

| 기능 | 모델 / 도구 | 설명 |
|------|------------|------|
| 메일 요약 | Exaone | 한국어 메일 핵심 내용 요약 |
| 초안 생성 | Exaone | 수신자·목적 기반 메일 초안 작성 |
| 멀티턴 대화 | Exaone | 세션 기반 연속 질의응답 |
| 첨부파일 요약 | Gemma + Docling | Docling으로 문서 파싱 후 요약 |
| 이미지 OCR | OCR API + @Async | 메일·파일 내 이미지 다건 병렬 추출 |

---

## 주요 구현

### Phase 1 — JEUS WAS 스레드 고갈 대응: 비동기 Polling 구조

LLM API 응답 시간이 10~30초까지 길어질 수 있어, Spring MVC 요청 스레드에서 동기 호출을 수행하면 JEUS WAS 스레드가 장시간 점유됐다.  
동시 요청이 증가하면 요청 스레드 풀이 고갈되어 신규 요청이 대기하거나 서비스 장애로 이어질 수 있었기 때문에, **요청 처리 스레드와 LLM 실행 스레드를 분리하는 Async Polling 패턴**으로 변경했다.

- **Submit API**: 요청을 등록하고 즉시 `taskId` 반환
- **Worker ThreadPool**: `@Async` + `ThreadPoolTaskExecutor`로 LLM API 호출 수행
- **Status API**: 클라이언트가 `taskId`로 처리 상태와 결과를 Polling
- **결과 저장소**: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED` 상태와 응답 결과 저장

이 방식으로 WebFlux, Java Virtual Thread, FastAPI 없이도 JEUS 8.5 환경에서 WAS 요청 스레드 점유 시간을 최소화했다.

```java
@PostMapping("/api/llm/tasks")
public ResponseEntity<TaskSubmitResponse> submit(@RequestBody LlmRequest request) {
    String taskId = taskService.submit(request);
    return ResponseEntity.accepted().body(new TaskSubmitResponse(taskId));
}

@GetMapping("/api/llm/tasks/{taskId}")
public ResponseEntity<TaskStatusResponse> getStatus(@PathVariable String taskId) {
    return ResponseEntity.ok(taskService.getStatus(taskId));
}

@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean("llmTaskExecutor")
    public Executor llmTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("llm-async-");
        executor.initialize();
        return executor;
    }
}

@Async("llmTaskExecutor")
public void execute(String taskId, LlmRequest request) {
    taskRepository.updateStatus(taskId, TaskStatus.RUNNING);

    try {
        String response = restTemplate.postForObject(llmEndpoint, request, String.class);
        taskRepository.saveSuccess(taskId, parse(response));
    } catch (Exception e) {
        taskRepository.saveFailure(taskId, e.getMessage());
    }
}
```


### Phase 2 — Caffeine Cache (시스템 프롬프트 캐싱)

시스템 프롬프트를 매 요청마다 DB에서 조회하는 반복 I/O 제거

```java
@Bean
public CacheManager cacheManager() {
    CaffeineCache promptCache = new CaffeineCache("systemPrompt",
        Caffeine.newBuilder()
            .expireAfterWrite(10, TimeUnit.MINUTES)
            .maximumSize(100)
            .build());
    return new SimpleCacheManager(List.of(promptCache));
}

@Cacheable(value = "systemPrompt", key = "#promptKey")
public String getSystemPrompt(String promptKey) {
    return promptRepository.findByKey(promptKey).getContent();
}
```

### Phase 2 — OCR 병렬 처리

메일·첨부파일 내 이미지 다건을 순차 호출하면 수십 초 지연 발생 → 전용 스레드풀 + `@Async`로 병렬 처리하여 지연을 **1/N**으로 단축

```java
@Bean("ocrTaskExecutor")
public Executor ocrTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(5);
    executor.setMaxPoolSize(20);
    executor.setThreadNamePrefix("ocr-async-");
    executor.initialize();
    return executor;
}

@Async("ocrTaskExecutor")
public CompletableFuture<String> extractTextFromImage(byte[] imageBytes) {
    return CompletableFuture.completedFuture(ocrApiClient.extract(imageBytes));
}

// 다건 병렬 호출
List<CompletableFuture<String>> futures = images.stream()
    .map(img -> ocrService.extractTextFromImage(img))
    .toList();
List<String> results = futures.stream()
    .map(CompletableFuture::join)
    .toList();
```

---

## 문제 해결 사례

| 문제 | 원인 | 해결 | 결과 |
|------|------|------|------|
| WAS 스레드 고갈 (서비스 다운) | LLM 응답 10~30초, 동기 처리 | `@Async` + Polling 전환 | WAS 스레드 고갈 해결 |
| 대용량 파일 타임아웃 | 동기 처리 게이트웨이 제한 | Polling 패턴 (taskId 즉시 반환) | 타임아웃 0건 |
| 시스템 프롬프트 반복 DB 조회 | 매 요청마다 DB I/O | Caffeine Cache (10분 TTL) | DB 부하 제거 |
| 이미지 OCR 수십 초 지연 | 다건 순차 API 호출 | 전용 Threadpool + @Async 병렬 처리 | 지연 1/N 단축 |

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| 시스템 프롬프트 조회 | 매 요청 DB I/O | < 1ms (Caffeine 캐시 히트) |
| 이미지 OCR 처리 시간 | N × API 응답시간 | 병렬 처리로 1/N 단축 |

---

## 부하 테스트 (JMeter)

- **시나리오**: 동시 100 사용자, 10분간 메일 요약 API 반복 호출
- **이슈**: http connection fail 에러 발생 
- **해결**: http connection pool 설정 후 http connection 재사용
- **결과**: 비동기 구조 에러율 0%

---

## 핵심 학습

- **환경 제약 내 아키텍처 결정**: FastAPI 제안이 기각된 상황에서 JEUS 제약을 분석하고, 같은 목표(비동기 처리)를 Java Spring + @Async로 달성하는 방법을 설계
- **JEUS 환경 대응**: WAR 패키징·provided 스코프·Maven Profile 등 Spring Boot를 JEUS에 맞춰 구성하는 경험
- **캐시 설계**: 반복 조회되는 시스템 프롬프트를 Caffeine 로컬 캐시로 처리하여 DB I/O 제거
