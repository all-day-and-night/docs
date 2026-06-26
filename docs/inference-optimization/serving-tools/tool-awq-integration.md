# AWQ 양자화와 서빙 도구 연계

---

## 역할 관계

AWQ 4bit Quantization은 모델 weight를 4bit로 줄여 GPU 메모리 사용량을 낮추는 기법이다.  
vLLM, TensorRT-LLM, Triton은 이 양자화된 모델을 실제 서비스 환경에서 실행하고 제공하는 계층이다.

```
AWQ 4bit Quantization  = 모델 경량화 기법 (GPU 메모리 절감)

vLLM                   = AWQ 모델을 빠르게 로딩하고 LLM API로 서빙하는 엔진

TensorRT-LLM           = NVIDIA GPU에 맞게 LLM 추론 엔진을 최적화하는 라이브러리

Triton Inference Server = 최적화된 모델을 REST/gRPC API로 운영 배포하는 inference server
```

---

## 성능 향상 기대 효과

| 기법 | 효과 |
|---|---|
| AWQ 4bit | GPU 메모리 사용량 약 75% 절감 (FP16 대비), 동일 GPU에서 더 큰 모델 또는 더 많은 동시 요청 처리 가능 |
| vLLM Continuous Batching | 동시 요청 throughput 향상 |
| vLLM PagedAttention | KV Cache 메모리 효율 향상 |
| TensorRT-LLM | latency 감소, throughput 향상, GPU 연산 최적화 |

---

## 구성안 A — 빠른 PoC 중심

```
AWQ 4bit 모델
→ vLLM
→ OpenAI-compatible API
→ RAG 서비스 연동
```

**장점**
- 구성 단순
- 빠른 검증 가능
- LLM/RAG PoC에 적합

**단점**
- NVIDIA GPU에 대한 극한 최적화는 TensorRT-LLM 대비 제한적일 수 있음

**적합 시나리오**: 저사양 GPU(L4, A10 등)에서 AWQ 4bit 모델로 목표 TPS/응답시간 달성 여부를 빠르게 확인하는 경우

---

## 구성안 B — NVIDIA 운영 최적화 중심

```
LLM 모델
→ AWQ 또는 FP16/FP8 등 precision 최적화
→ TensorRT-LLM 엔진 빌드
→ Triton Inference Server 배포
→ REST/gRPC API 제공
```

**장점**
- NVIDIA GPU 성능 최적화에 유리
- 운영 표준화와 모니터링에 유리
- 대규모 서비스 운영에 적합

**단점**
- 엔진 빌드, 튜닝, 배포 구조가 상대적으로 복잡
- 모델 변경 시마다 엔진 재빌드 필요

**적합 시나리오**: 운영 확정 모델을 A100/H100 등에서 최대 성능으로 제공해야 하는 경우

---

## Kubernetes 환경 배치 예시

```
Kubernetes Cluster
└─ GPU Node
   ├─ NVIDIA Driver
   ├─ NVIDIA Container Toolkit
   ├─ NVIDIA GPU Operator / Device Plugin
   └─ Inference Pod
      ├─ vLLM Server (구성안 A)
      │  └─ AWQ 4bit 모델 → OpenAI-compatible API
      └─ 또는 Triton Inference Server (구성안 B)
         └─ TensorRT-LLM 엔진 → REST/gRPC API
```

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
```
