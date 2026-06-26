# 서빙 도구 비교 — vLLM / TensorRT-LLM / Triton Inference Server

---

## 한 줄 정의

```
vLLM               = LLM을 쉽고 빠르게 API로 서빙하는 엔진
TensorRT-LLM       = NVIDIA GPU에서 LLM 추론 성능을 최적화하는 라이브러리
Triton Inference Server = 여러 AI 모델을 운영 환경에서 API로 배포하는 inference server
```

vLLM과 TensorRT-LLM은 **추론 엔진** 성격이 강하고,  
Triton은 **서빙 플랫폼** 성격이 강하다.

---

## 전체 비교

| 구분 | vLLM | TensorRT-LLM | Triton Inference Server |
|---|---|---|---|
| 분류 | LLM 추론/서빙 엔진 | NVIDIA GPU용 LLM 최적화 라이브러리 | 범용 inference serving 서버 |
| 주 대상 | LLM | LLM | LLM 포함 다양한 AI 모델 |
| 핵심 목적 | 빠른 LLM API 서빙 | NVIDIA GPU 성능 최적화 | 모델 배포와 API 운영 표준화 |
| 주요 강점 | OpenAI-compatible API, Continuous Batching | 낮은 latency, TensorRT 최적화 | REST/gRPC, multi-model serving |
| 도입 난이도 | 낮음 | 중간~높음 | 중간 |
| PoC 적합성 | 높음 | 중간 | 중간 |
| 운영 최적화 적합성 | 높음 | 매우 높음 | 매우 높음 |
| NVIDIA 의존도 | 낮음~중간 | 높음 | 중간~높음 |

---

## vLLM

**개념**: LLM 추론과 서빙을 쉽고 빠르게 수행하기 위한 오픈소스 라이브러리.

**핵심 기법**
- **PagedAttention**: OS 페이징에서 착안한 KV Cache 메모리 관리 → 낭비 55% → 4% 이하
- **Continuous Batching**: 슬롯 비는 즉시 새 요청 합류 → GPU 활용률 향상
- **OpenAI-compatible API**: 기존 앱을 최소 수정으로 사내 LLM으로 전환 가능

**적합한 경우**
- 빠른 LLM PoC
- Hugging Face 모델을 API 서버로 바로 올리고 싶은 경우
- RAG 백엔드 LLM serving layer
- AWQ/GPTQ 양자화 모델을 빠르게 올려보고 싶은 경우

---

## TensorRT-LLM

**개념**: NVIDIA GPU에서 LLM 추론 성능을 최적화하기 위한 NVIDIA 오픈소스 라이브러리.

```
LLM 모델
→ NVIDIA GPU에 맞게 최적화된 TensorRT 엔진으로 변환
→ 고성능 추론 실행
```

**핵심 기법**
- **TensorRT 엔진 빌드**: 모델 구조, precision, batch, sequence length 조건에 맞춰 엔진 컴파일
- **GPU 커널 최적화**: A10, L4, A100, H100 등 아키텍처 별 최적화
- **낮은 latency / 높은 throughput**: 대규모 운영 환경에서 GPU 효율 극대화

**vLLM과 비교**

| 항목 | vLLM | TensorRT-LLM |
|---|---|---|
| 도입 난이도 | 낮음 | 중간~높음 |
| 엔진 빌드 필요 | 없음 | 있음 (모델별 빌드 필요) |
| GPU 성능 최적화 | 중간 | 매우 높음 |
| PoC 적합성 | 높음 | 중간 |

**적합한 경우**
- NVIDIA GPU에서 최대 성능이 필요한 경우
- latency/throughput 최적화가 최우선인 운영 환경
- Triton Inference Server와 함께 NVIDIA 스택을 표준화하는 경우

---

## Triton Inference Server

**개념**: NVIDIA의 오픈소스 inference serving 서버. HTTP/gRPC endpoint로 추론 요청을 처리한다.

**핵심 기능**
- **REST/gRPC API**: 외부 애플리케이션과 표준 인터페이스로 통신
- **다양한 백엔드 지원**: TensorRT, PyTorch, ONNX Runtime, Python backend
- **Multi-model Serving**: 하나의 서버에서 여러 모델 동시 서빙
- **Dynamic Batching**: 여러 요청을 동적으로 묶어 GPU 사용률 향상
- **운영 친화 기능**: metric, model versioning, Prometheus 연동

**model repository 구조**

```
model_repository/
├── llm_model/
│   ├── config.pbtxt
│   └── 1/
│       └── model.plan   # TensorRT 엔진
└── vision_model/
    ├── config.pbtxt
    └── 1/
        └── model.onnx
```

**적합한 경우**
- 여러 종류의 AI 모델(LLM + Vision + 추천 등)을 한 곳에서 운영
- REST/gRPC 기반 표준 API 필요
- Kubernetes 기반 AI serving 플랫폼 구성
- 모델 버전 관리와 운영 모니터링이 중요한 경우

---

## 역할 구조

```
[모델 경량화]        [추론 엔진]              [서빙 레이어]
AWQ / GPTQ      →   vLLM             →   vLLM 내장 서버
양자화           →   TensorRT-LLM     →   Triton Inference Server
```

- **vLLM**: 추론 엔진 + 서빙 레이어 역할을 동시에 수행
- **TensorRT-LLM**: 순수 추론 최적화 엔진, 별도 서빙 레이어(Triton) 필요
- **Triton**: 서빙 레이어 전담, 다양한 추론 엔진 백엔드를 수용

---

## 병행 사용 패턴

### 패턴 A — PoC 중심 (vLLM 단독)

```
AWQ 4bit 모델 → vLLM → OpenAI-compatible API → 서비스
```

**장점**: 구성 단순, 빠른 검증  
**단점**: NVIDIA GPU에 대한 극한 최적화는 TensorRT-LLM 대비 제한적

### 패턴 B — NVIDIA 운영 최적화 (TensorRT-LLM + Triton)

```
LLM 모델 → TensorRT-LLM 엔진 빌드 → Triton Inference Server → REST/gRPC API
```

**장점**: NVIDIA GPU 성능 최적화, 운영 표준화와 모니터링  
**단점**: 엔진 빌드, 튜닝, 배포 구조가 상대적으로 복잡

### 패턴 C — 혼합 운영 (vLLM + Triton)

```
LLM      → vLLM (Python backend) → Triton → API
비전/OCR  → TensorRT             → Triton → API
```

LLM은 vLLM으로 서빙하면서 Triton의 운영 관리 기능 활용

---

## AWQ 양자화와의 연계

| 기법 | 역할 |
|---|---|
| AWQ 4bit | GPU 메모리 ~75% 절감 (FP16 대비) |
| vLLM | AWQ 모델을 빠르게 로딩하고 API로 서빙 |
| TensorRT-LLM | NVIDIA GPU에 맞게 추론 엔진 최적화 |
| Triton | 최적화된 모델을 REST/gRPC API로 운영 배포 |

---

## 참고

- vLLM 공식 문서: https://docs.vllm.ai/
- TensorRT-LLM 공식 문서: https://docs.nvidia.com/tensorrt-llm/index.html
- Triton 공식 문서: https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/index.html
