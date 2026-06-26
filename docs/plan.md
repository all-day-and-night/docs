# AI Inference Platform 실습 계획

## 목적

- 로컬 모델 서빙 경험
- Docker 기반 AI 서비스 구성
- AWS EKS 기반 Kubernetes 운영 경험
- vLLM 기반 LLM Inference Serving
- AI 서비스 백엔드 아키텍처 설계
- 추론 성능 측정 및 병목 분석
- 추론 비용 최적화
- Prometheus / Grafana 기반 모니터링
- OpenAI API 호환 로컬 LLM 서비스 구축

최종 결과물: **Local LLM 기반 Webtoon AI Assistant Platform**

---

## 전체 아키텍처

```
Client / Webtoon Assistant UI
       ↓
FastAPI Backend ──→ Redis Cache
       ↓
vLLM OpenAI-Compatible Server
       ↓
Local LLM Model

모니터링: Prometheus → Grafana
배포: AWS EKS
```

---

## 기술 스택

### Local 개발 환경

| 분류 | 기술 |
|------|------|
| 언어 | Python 3.11+ |
| 백엔드 | FastAPI |
| 컨테이너 | Docker Desktop |
| LLM 서빙 | vLLM / llama.cpp |
| 캐시 | Redis |
| 부하 테스트 | Locust / k6 |
| 모니터링 | Prometheus, Grafana |

### Cloud / Production 환경

| 분류 | 기술 |
|------|------|
| 오케스트레이션 | AWS EKS |
| 이미지 저장소 | ECR |
| 로드밸런서 | ALB Ingress Controller |
| K8s 리소스 | Deployment / Service / HPA |
| 모니터링 | Prometheus, Grafana, CloudWatch |

### Model Serving 후보

Mac 로컬 환경 GPU 제약으로 다음 순서 진행:

1. **llama.cpp / Ollama** — 로컬 모델 서빙
2. **OpenAI-compatible API Wrapper** 구성
3. **AWS GPU 환경 vLLM** 기반 서빙
4. (선택) TensorRT-LLM / Triton Inference Server

**추천 모델:** Qwen2.5 7B Instruct, Llama 3.1 8B Instruct, Mistral 7B Instruct

---

## 단계별 계획

### Phase 0 — Repository 초기 구성

Monorepo 구조 생성 + FastAPI backend 초기화

```
ai-inference-platform/
├── backend/      # FastAPI (api, services, clients, schemas)
├── serving/      # Docker Compose (ollama, vllm)
├── infra/        # k8s manifests, eks, monitoring
├── benchmark/    # Locust, k6 스크립트
└── scripts/      # build, push, deploy 스크립트
```

---

### Phase 1 — Mac 로컬 LLM 서빙

**목표:** Mac에서 로컬 모델 실행 + FastAPI OpenAI-compatible 호출

**Option A. Ollama** (권장)
- Mac M-series에서 가장 빠른 로컬 모델 실행
- OpenAI-compatible endpoint 지원

**Option B. llama.cpp**
- 모델 양자화 및 GGUF 포맷 이해에 유리

**구현 범위:**
- `/chat/completions` API 호출 가능한 로컬 서버
- FastAPI backend에서 LLMClient 인터페이스 추상화
- OllamaClient → VLLMClient 교체 가능 설계

---

### Phase 2 — Webtoon AI Assistant 기능

**목표:** 웹툰 도메인 특화 GenAI 서비스 백엔드

**API 목록:**

```
POST /api/v1/chat
POST /api/v1/webtoon/character-chat
POST /api/v1/webtoon/synopsis/rewrite
POST /api/v1/webtoon/short-animation/prompt
GET  /api/v1/health
GET  /api/v1/metrics
```

**핵심 기능:**
1. **캐릭터 설정 기반 대화** — 웹툰 캐릭터 프로필 기반 응답 생성
2. **시놉시스 개선** — 장르/캐릭터 관계/갈등 구조/다음 화 훅 제안
3. **숏 애니메이션 프롬프트 생성** — 컷 단위 영상 생성 모델용 프롬프트

---

### Phase 3 — Docker Compose 로컬 운영

```yaml
services:
  backend:   # FastAPI (8080)
  redis:     # Redis 7 (6379)
  prometheus: # Prometheus (9090)
  grafana:   # Grafana (3000)
```

`make local-up` 으로 전체 스택 실행

---

### Phase 4 — Benchmark 및 성능 측정

**측정 지표:** P50/P95/P99 latency, RPS, Tokens/sec, Error rate, Cost/1K requests

**부하 시나리오:**

| 시나리오 | 동시 사용자 | 시간 |
|---------|------------|------|
| 단일 사용자 | 1 | 3분 |
| 일반 서비스 | 30 | 10분 |
| Spike 테스트 | 100 (ramp-up 1분) | 5분 |

---

### Phase 5 — Inference 최적화 실험

| 실험 | 비교 항목 |
|------|----------|
| 모델 크기 (3B / 7B / 14B) | latency, quality, memory |
| 양자화 (FP16 / INT8 / 4bit GGUF) | VRAM, latency, 품질, 비용 |
| Redis Cache 적용 | hit ratio, latency, CPU |
| Streaming (SSE) | first token latency, 체감 응답성 |

> **추가 실험:** SSE → Redis pub/sub / Kafka pub/sub, Celery background 처리

---

### Phase 6 — AWS EKS 배포

**1차 배포:** Backend + Redis + Prometheus + Grafana

**2차 배포:** GPU Node Group + vLLM

**K8s 리소스:**
```
Namespace: ai-inference
Deployment: backend, redis, vllm
Service: backend-service, redis-service, vllm-service
Ingress: backend-ingress
HPA: backend-hpa
ConfigMap/Secret: 환경변수 관리
```

→ [AWS 인프라 구축 가이드](./aws-infra/00-overview)

---

### Phase 7 — EKS에서 vLLM 서빙

**vLLM Deployment 핵심 설정:**

```yaml
image: vllm/vllm-openai:latest
args:
  - --model Qwen/Qwen2.5-7B-Instruct
  - --host 0.0.0.0
  - --port 8000
resources:
  limits:
    nvidia.com/gpu: 1
```

**실험:** continuous batching, max-num-seqs, GPU utilization, OpenAI API 비용 비교

---

### Phase 8 — 비용 최적화 분석

| Case | 구성 |
|------|------|
| A | OpenAI API |
| B | AWS EKS + vLLM + GPU |
| C | 소형 모델 + Cache |
| D | 대형 모델 (Cache 없음) |

---

### Phase 9 — Monitoring / Observability

**수집 지표:**

| 레이어 | 지표 |
|--------|------|
| Backend | request count, latency, error, cache hit ratio |
| LLM | prompt/completion tokens, tokens/sec, first token latency |
| Infra | CPU, Memory, GPU utilization, Pod restart, HPA event |

---

### Phase 10 — 문서화

```
docs/architecture.md
docs/benchmark-report.md
docs/optimization-report.md
docs/cost-analysis.md
docs/observability.md
docs/portfolio-summary.md
```

---

## 추천 진행 일정

| 주차 | 작업 |
|------|------|
| Week 1 | Repository 구성, FastAPI backend, Ollama 연동, Webtoon API 3개 |
| Week 2 | Docker Compose, Redis cache, Prometheus metrics, Grafana 초안 |
| Week 3 | Locust benchmark, cache/streaming 비교 실험 |
| Week 4 | AWS ECR/EKS 배포, Ingress/HPA 구성 |
| Week 5 | EKS GPU node, vLLM deployment, VLLMClient 전환 |
| Week 6 | 비용 분석, 최적화 리포트, 문서 정리 |

---

## 최종 산출물 체크리스트

### Code
- [ ] FastAPI backend + LLMClient 추상화
- [ ] OllamaClient / VLLMClient
- [ ] Webtoon AI APIs
- [ ] Redis cache + Streaming response
- [ ] Prometheus metrics
- [ ] Locust benchmark
- [ ] Cost calculator

### Infra
- [ ] Dockerfile + Docker Compose
- [ ] Kubernetes manifests (Deployment, Service, Ingress, HPA)
- [ ] EKS 배포 스크립트 + ECR push
- [ ] vLLM GPU deployment

### Docs
- [ ] README + architecture.md
- [ ] benchmark-report.md + optimization-report.md
- [ ] cost-analysis.md + observability.md
- [ ] portfolio-summary.md

---

## 이력서용 핵심 문장

- vLLM 기반 OpenAI-compatible LLM inference server를 AWS EKS GPU node에 배포하고 FastAPI backend와 연동
- Locust 기반 부하 테스트를 통해 P50/P95 latency, throughput, error rate를 측정하고 inference 병목 분석 수행
- Redis cache 및 streaming response를 적용하여 반복 요청 latency와 사용자 체감 응답성 개선
- OpenAI API 사용 대비 self-hosted LLM serving 비용을 비교하고 request/token 기준 비용 최적화 시나리오 수립
- Prometheus/Grafana 기반 AI service observability dashboard를 구성하여 latency, error rate, cache hit ratio 모니터링
