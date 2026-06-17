# TensorRT-LLM — NVIDIA GPU 최적화 라이브러리

---

## 개념

TensorRT-LLM은 NVIDIA GPU에서 LLM 추론 성능을 최적화하기 위한 NVIDIA의 오픈소스 라이브러리다.  
LLM을 정의하고, NVIDIA GPU에서 효율적으로 추론하기 위한 TensorRT 엔진을 빌드하는 Python API와 런타임 구성요소로 이루어진다.

```
LLM 모델
→ NVIDIA GPU에 맞게 최적화된 TensorRT 엔진으로 변환
→ 고성능 추론 실행
```

---

## 주요 특징

### 1) NVIDIA GPU 최적화

A10, L4, A100, H100 등 NVIDIA GPU 환경에서 성능 최적화를 극대화하기 위해 설계되었다.  
GPU 아키텍처에 맞는 커널 최적화, 연산자 퓨전(operator fusion) 등을 자동으로 적용한다.

### 2) TensorRT Engine 빌드

모델을 그대로 실행하는 것보다 TensorRT 엔진으로 변환하여 실행함으로써 GPU 연산을 최적화한다.  
엔진 빌드 시 모델 구조, precision, batch size, sequence length 조건을 명시해야 한다.

```
모델 변환 과정:
HuggingFace 모델
→ TensorRT-LLM Python API로 모델 정의
→ trtllm-build로 TensorRT 엔진 컴파일
→ 런타임에서 최적화된 엔진 실행
```

### 3) 낮은 latency / 높은 throughput

실시간 응답 속도와 처리량을 개선하는 데 초점을 둔다.  
대규모 운영 환경에서 latency를 줄이고 GPU 효율을 극대화하는 경우에 적합하다.

### 4) NVIDIA 생태계 연계

NVIDIA GPU, CUDA, TensorRT, Triton Inference Server 등 NVIDIA AI inference stack과 함께 사용하는 경우가 많다.

---

## 사용 예시

```
LLM 모델
→ TensorRT-LLM으로 엔진 빌드
→ NVIDIA GPU 최적화 런타임에서 실행
→ Triton 또는 별도 serving layer로 API 제공
```

---

## vLLM과의 차이

| 항목 | vLLM | TensorRT-LLM |
|---|---|---|
| 도입 난이도 | 낮음 | 중간~높음 |
| 엔진 빌드 필요 | 없음 | 있음 (모델별 빌드 필요) |
| GPU 성능 최적화 | 중간 | 매우 높음 |
| PoC 적합성 | 높음 | 중간 |
| 운영 최적화 적합성 | 높음 | 매우 높음 |

---

## 적합한 경우

- NVIDIA GPU에서 최대 성능을 끌어내야 하는 경우
- 운영 환경에서 latency와 throughput 최적화가 중요한 경우
- 모델별 엔진 빌드 및 성능 튜닝을 감수할 수 있는 경우
- [Triton](./tool-triton)과 함께 운영 표준화를 고려하는 경우
- PoC보다 운영 최적화 단계에 가까운 경우

---

## 참고

- 공식 문서: https://docs.nvidia.com/tensorrt-llm/index.html
- GitHub Pages 문서: https://nvidia.github.io/TensorRT-LLM/
