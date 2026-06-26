# Triton Inference Server — 범용 inference serving 서버

---

## 개념

Triton Inference Server는 NVIDIA의 오픈소스 inference serving 서버다.  
NVIDIA GPU에 최적화된 클라우드 추론 솔루션으로, HTTP 또는 gRPC endpoint를 통해 원격 클라이언트가 모델 추론을 요청할 수 있도록 한다.

특정 LLM 하나만을 위한 도구라기보다는, 다양한 AI 모델을 운영 환경에 배포하고 관리하기 위한 **모델 서빙 플랫폼**에 가깝다.

---

## 주요 특징

### 1) REST/gRPC API 제공

Triton에 모델을 배포하면 외부 애플리케이션은 REST 또는 gRPC 방식으로 추론 요청을 보낼 수 있다.

### 2) 다양한 백엔드 지원

| 백엔드 | 설명 |
|---|---|
| TensorRT | NVIDIA GPU 최적화 모델 |
| PyTorch (TorchScript) | PyTorch 모델 |
| ONNX Runtime | ONNX 변환 모델 |
| Python backend | 커스텀 Python 추론 코드 |
| TensorRT-LLM backend | LLM 특화 고성능 백엔드 |

LLM뿐 아니라 이미지 분류, 객체 탐지, 추천 모델 등 다양한 모델을 함께 운영할 수 있다.

### 3) Dynamic Batching

여러 요청을 동적으로 묶어 batch 처리한다. GPU 사용률과 throughput을 개선한다.

### 4) Multi-model Serving

하나의 Triton 서버에서 여러 모델을 동시에 서빙할 수 있다.  
운영 환경에서 모델 버전 관리, 다중 모델 배포, inference endpoint 표준화에 유리하다.

### 5) 운영 친화 기능

- metric 수집 (Prometheus 연동 가능)
- model repository 구조로 모델 배치
- model versioning 지원
- Kubernetes 환경에서 GPU node 위에 Triton Pod 배포 가능

---

## 사용 예시

```
TensorRT 엔진 / PyTorch 모델 / ONNX 모델
→ Triton model repository에 배치
→ Triton Inference Server 실행
→ REST/gRPC API로 추론 요청 처리
→ Prometheus 등으로 metric 수집
```

### model repository 구조

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

---

## Kubernetes 배포

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
```

GPU 1장을 할당받은 Pod에서 Triton 서버를 실행하며, 여러 모델을 동시에 서빙한다.

---

## 적합한 경우

- 여러 종류의 AI 모델을 하나의 표준 serving 구조로 운영해야 하는 경우
- REST/gRPC 기반 inference API가 필요한 경우
- Kubernetes 기반 AI serving 플랫폼을 구성하는 경우
- 모델 버전 관리와 운영 모니터링이 중요한 경우
- TensorRT, PyTorch, ONNX 등 다양한 backend를 함께 써야 하는 경우
- [TensorRT-LLM](./tool-tensorrt-llm)과 함께 NVIDIA 운영 스택을 표준화하는 경우

---

## 참고

- 공식 문서: https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/index.html
- 문서 허브: https://docs.nvidia.com/triton-inference-server/index.html
