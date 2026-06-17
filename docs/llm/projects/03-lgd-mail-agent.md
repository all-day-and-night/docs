# LG 디스플레이 메일 AI Agent

::: info 프로젝트 개요
- **기간**: 2025.01 ~ 2025.06 (6개월)
- **역할**: Backend Developer, System Architect
- **팀 구성**: PM 1명, SE 1명 (본인)
- **소속**: LG CNS → LG 디스플레이 (고객사)
- **인프라**: On-Premise (Jeus WAS 기반)
:::

---

## 배경 및 목적

LG 디스플레이 사내 메일 시스템에 LLM 기반 AI 기능 추가.  
메일 요약, 첨부파일 요약, 초안 생성, 멀티턴 대화 기능을 구현하며,  
**2인 소규모팀**으로 아키텍처 설계부터 구현, 부하 테스트까지 전담했다.

---

## 아키텍처

```
메일 클라이언트 UI
    ↓ REST 요청
Spring REST API (Jeus WAS)
    ↓ 비동기 submit → taskId 반환
Async ThreadPoolExecutor
    ├→ RestTemplate → Llama 3 (범용 요약/대화)
    └→ RestTemplate → Exaone (한국어 특화)
        → 결과 저장 → Redis Cache

클라이언트: taskId로 Polling → 완료 확인
Jenkins → CI/CD → Jeus WAS 배포
```

---

## LLM 기능 목록

| 기능 | 모델 | 설명 |
|------|------|------|
| 메일 요약 | Exaone | 한국어 메일 핵심 내용 요약 |
| 첨부파일 요약 | Llama 3 | PDF/Word 텍스트 추출 후 요약 |
| 초안 생성 | Exaone | 수신자/목적 기반 메일 초안 작성 |
| 멀티턴 대화 | Llama 3 | 세션 기반 연속 질의응답 |

---

## 주요 구현

### 비동기 + ThreadPoolExecutor 구조

LLM API 응답 시간이 길어 동기 처리 시 WAS 스레드 고갈 문제 → **Async + Polling** 패턴으로 해결

```java
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
public CompletableFuture<LlmResult> callLlmAsync(LlmRequest request) {
    String response = restTemplate.postForObject(llmEndpoint, request, String.class);
    return CompletableFuture.completedFuture(parse(response));
}
```

### Redis 캐시로 중복 요청 제거

```java
@Cacheable(value = "mailSummary", key = "#mailId")
public SummaryResult getSummary(String mailId) {
    return llmService.summarize(mailId);  // Cache Miss 시에만 LLM 호출
}
```

---

## 문제 해결 사례

| 문제 | 원인 | 해결 | 결과 |
|------|------|------|------|
| WAS 스레드 고갈 (서비스 다운) | LLM 응답 10~30초, 동기 처리 | `@Async` + Polling 방식 전환 | 동시 처리 5배 증가 |
| LLM 서버 과부하 | 동일 메일 팀원 동시 요청 | Redis `@Cacheable` | LLM 부하 60% 감소 |
| 멀티턴 세션 유실 | JVM 인메모리 저장 | Redis TTL 기반 세션 저장 | 재시작 후에도 대화 유지 |
| 대용량 PDF 타임아웃 | 동기 처리 게이트웨이 제한 | Polling 패턴 (taskId 즉시 반환) | 타임아웃 0건 |

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| 동시 처리 가능 요청 | ~10건 (스레드 고갈) | ~50건 |
| 중복 요청 응답 시간 | 10~30초 | < 100ms (캐시 히트) |
| 멀티턴 세션 유지율 | 재시작 시 0% | 100% |

---

## 부하 테스트 (JMeter)

- **시나리오**: 동시 50 사용자, 5분간 메일 요약 API 반복 호출
- **결과**: 비동기 구조 후 에러율 0%, P95 latency 30초 → 500ms (캐시 히트 기준)

---

## 핵심 학습

- **비동기 패턴 선택 기준**: 응답 시간이 긴 외부 API는 반드시 비동기 + Polling 또는 SSE 고려
- **2인 소규모팀**: 설계부터 운영까지 전담 — 트레이드오프를 직접 경험
- **Jeus WAS**: 공공/대기업 On-Premise 환경에서 자주 사용 — Spring 배포 방식 차이 이해 필요
