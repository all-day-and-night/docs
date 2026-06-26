# LLM 추론 성능 개선 — 전체 개요

## 최적화 흐름

```
병목 측정
  → 원인 분석
  → 서빙 구조 개선
  → 응답 속도 개선
  → GPU / 인프라 비용 절감
  → Before / After 리포트 작성
```

---

## LLM 응답 시간은 어디서 발생하는가?

```
전체 응답 시간
= API 서버 처리 시간
+ Queue 대기 시간
+ Prompt 구성 시간
+ 모델 Prefill 시간   ← KV Cache 구성 단계
+ Token Decode 시간   ← 토큰 생성 단계
+ 후처리 시간
+ 네트워크 시간
```

### Prefill 단계
모델이 입력 토큰 전체를 읽고 KV Cache를 구성하는 단계.

> 긴 시스템 프롬프트 + 긴 대화 이력 + 많은 RAG 검색 결과 → **Prefill latency 증가**

### Decode 단계
모델이 응답 토큰을 한 번에 하나씩 생성하는 단계.

> 긴 답변 + 큰 모델 + 낮은 GPU 활용률 → **Decode latency 증가**

---

## 단계별 최적화 구성

| 단계 | 노트 | 핵심 기법 |
|------|------|-----------|
| 1 | [서빙 엔진 - vLLM](./01-vllm) | Transformers → vLLM 전환 (PagedAttention + Continuous Batching) |
| 2 | [양자화 - AWQ GPTQ](./02-quantization) | FP16 → AWQ / GPTQ 4-bit 양자화 |
| 3 | [Context 최적화](./03-context-optimization) | 입력 토큰 수 감소 (RAG Top-k 축소, 대화 이력 요약) |
| 4 | [모델 라우팅](./04-model-routing) | 요청 복잡도 기반 모델 분기 |
| 5 | [캐싱](./05-caching) | Redis 응답 캐시 + KV Cache 재사용 |
| 6 | [인프라 최적화](./06-infra) | EKS 노드 분리, AutoScaling, Spot 인스턴스 |
| 7 | [메트릭 취합 및 성능 개선](./07-metrics) | vLLM 지표 기반 튜닝 (Prometheus, Grafana, PromQL) |
| 8 | [LMCache + Redis](./08-lmcache-redis) | vLLM KV Cache를 Redis에 저장 — replica 간 공유 및 TTFT 개선 |

서빙 도구 비교는 [도구 비교 - vLLM TensorRT Triton](./serving-tools/tool-comparison) 참고.

---

## 핵심 측정 지표

```
P50 / P95 / P99 latency
Time To First Token (TTFT)
Tokens/sec (처리량)
Requests/sec
GPU Utilization (%)
GPU Memory Usage (GB)
Queue Length
Cost per 1K requests
Cost per 1M tokens
```

---

## 목표 아키텍처

```
User
 ↓
ALB Ingress
 ↓
FastAPI Backend
 ↓
Request Router
 ├─ Cache Hit       → Redis 응답            (모델 호출 없음, 0ms)
 ├─ 단순 요청       → Small Local Model     (저비용)
 ├─ 복잡한 요청     → vLLM Large Model      (고품질)
 └─ 프리미엄 품질   → Bedrock / OpenAI      (외부 API)
 ↓
Response Streaming
```
