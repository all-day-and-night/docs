# vLLM — LLM 추론/서빙 엔진

---

## 개념

vLLM은 LLM 추론과 서빙을 쉽고 빠르게 수행하기 위한 오픈소스 라이브러리다.  
공식 문서에서는 "LLM inference and serving"을 위한 빠르고 사용하기 쉬운 라이브러리로 설명한다.

---

## 주요 특징

### 1) PagedAttention 기반 KV Cache 최적화

LLM 추론에서 이전 토큰의 key/value 정보를 저장하는 KV Cache는 GPU 메모리를 많이 차지한다.  
vLLM은 PagedAttention 방식으로 KV Cache를 효율적으로 관리하여 메모리 낭비를 줄이고 처리량을 높인다.

```
기존 방식: KV Cache를 연속 메모리 블록으로 할당 → 단편화로 메모리 낭비
PagedAttention: 비연속 메모리 페이지 단위로 관리 → 메모리 효율 향상, throughput 증가
```

### 2) Continuous Batching

사용자 요청 시점이 달라도 여러 요청을 동적으로 묶어 GPU를 효율적으로 사용한다.  
동시 요청이 많은 환경에서 throughput을 높이는 핵심 기법이다.

```
정적 배치: 요청 N개가 모일 때까지 대기 → 지연 발생
Continuous Batching: 완료된 요청은 즉시 빼고 새 요청을 바로 삽입 → GPU 활용률 향상
```

### 3) OpenAI-compatible API

OpenAI API와 동일한 인터페이스를 제공하여, 기존 애플리케이션을 큰 수정 없이 사내 LLM 엔드포인트로 전환할 수 있다.

### 4) LLM 서빙 특화

일반 딥러닝 모델이 아닌 LLM 텍스트 생성 모델 서빙에 특화되어 있다.  
Chat Completion, Completion API 형태로 모델을 바로 제공할 수 있다.

---

## 사용 예시

AWQ 4bit 양자화 모델을 vLLM으로 서빙하는 흐름:

```
AWQ 4bit 모델
→ vLLM에 로딩
→ GPU 메모리 사용량 절감
→ Continuous Batching으로 동시 요청 처리
→ OpenAI-compatible API로 서비스 제공
```

---

## 적합한 경우

- 빠르게 LLM PoC를 해야 하는 경우
- Hugging Face 모델(Llama, Qwen, Mistral 등)을 API 서버로 바로 올리고 싶은 경우
- RAG 백엔드의 LLM serving layer가 필요한 경우
- OpenAI-compatible API가 필요한 경우
- AWQ/GPTQ 등 양자화 모델을 빠르게 올려보고 싶은 경우

---

## 참고

- 공식 문서: https://docs.vllm.ai/
