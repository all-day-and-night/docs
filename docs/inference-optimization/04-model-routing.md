# 4단계 — Model Routing: 요청에 맞는 모델 분기

---

## 문제: 모든 요청에 대형 모델을 쓸 필요가 없다

```
라우팅 없는 경우:
  "반품 정책이 뭔가요?" → 14B 모델  ← 과잉 비용
  "3000자 소설을 써줘" → 14B 모델  ← 적절
  "안녕!"              → 14B 모델  ← 극심한 낭비
```

모든 요청이 최대 모델로 흐르면 GPU 비용은 **요청량에 비례해서 선형으로 증가**한다.  
하지만 대부분의 요청은 훨씬 작은 모델로 처리 가능하다.

---

## 핵심 아이디어: 복잡도 기반 라우팅

```
사용자 요청
 ↓
복잡도 라우터
 ├─ 단순   → Small Model  (1.5B / 3B)    저비용, 빠름
 ├─ 일반   → Medium Model (7B / 8B)      균형
 ├─ 복잡   → Large Model  (14B / 34B)    고품질
 └─ 프리미엄 → OpenAI / Bedrock          외부 API
```

---

## 복잡도 분류 방법

### 규칙 기반 (빠름, 모델 불필요)

```python
def classify_complexity(prompt: str) -> str:
    token_count = len(tokenizer.encode(prompt))

    if token_count < 50 and not requires_reasoning(prompt):
        return "simple"
    elif token_count < 300:
        return "normal"
    else:
        return "complex"

def requires_reasoning(prompt: str) -> bool:
    keywords = ["설명해", "분석해", "비교해", "작성해", "요약해", "설계해"]
    return any(kw in prompt for kw in keywords)
```

### 분류 모델 사용 (더 정확)

레이블링된 샘플로 소형 분류기(fine-tuned BERT 또는 Qwen 0.5B)를 학습한다.  
약 **20ms 지연**이 추가되지만 더 정확하게 라우팅한다.

---

## 모델 티어 구성

| 티어 | 모델 | VRAM | 응답 시간 | 사용 사례 |
|------|------|------|---------|----------|
| 단순 | Qwen2.5 1.5B | 2GB | ~200ms | FAQ, 인사, 예/아니오 |
| 일반 | Mistral 7B / Llama3.1 8B | 5GB | ~1~2초 | 일반 대화, 요약 |
| 복잡 | Qwen2.5 14B | 10GB | ~4~6초 | 장문 작성, 분석 |
| 프리미엄 | OpenAI GPT-4o | 외부 | ~2~4초 | 최고 품질 필요 시 |

---

## 인프라 구성

세 가지 로컬 모델 티어를 각각 별도의 vLLM 서버로 운영한다.

```
FastAPI (라우터)
 ├─ POST /v1/chat  →  복잡도 라우터
 │                     ├─ simple  → http://vllm-small:8001
 │                     ├─ normal  → http://vllm-medium:8002
 │                     └─ complex → http://vllm-large:8003
 └─ 폴백           →  OpenAI API (외부)
```

Kubernetes에서는 각 티어를 GPU 노드 그룹 위의 별도 Deployment로 배포한다.

---

## 라우터 구현

```python
# router.py
CLIENTS = {
    "simple":  AsyncOpenAI(base_url="http://vllm-small:8001/v1",  api_key="dummy"),
    "normal":  AsyncOpenAI(base_url="http://vllm-medium:8002/v1", api_key="dummy"),
    "complex": AsyncOpenAI(base_url="http://vllm-large:8003/v1",  api_key="dummy"),
}
MODELS = {
    "simple":  "qwen2.5-1.5b",
    "normal":  "mistral-7b",
    "complex": "qwen2.5-14b",
}

def classify(messages: list[dict]) -> str:
    last = messages[-1]["content"]
    n_tokens = len(last.split())

    complex_keywords = ["설명해", "분석해", "비교해", "작성해", "요약해", "설계해", "코드"]
    if any(kw in last for kw in complex_keywords) or n_tokens > 100:
        return "complex"
    if n_tokens < 20 and "?" not in last:
        return "simple"
    return "normal"

@app.post("/v1/chat")
async def chat(req: ChatRequest):
    tier = classify(req.messages)
    response = await CLIENTS[tier].chat.completions.create(
        model=MODELS[tier], messages=req.messages, max_tokens=512,
    )
    return {"tier": tier, "content": response.choices[0].message.content}
```

---

## 모니터링 (Prometheus)

```bash
curl http://localhost:9090/metrics | grep llm_routing
# llm_routing_total{tier="simple"}  1842
# llm_routing_total{tier="normal"}   934
# llm_routing_total{tier="complex"}  224
# → 단순 요청 61%, 일반 31%, 복잡 8%
```

---

## 예상 결과

| 지표 | 라우팅 없음 | 라우팅 적용 |
|------|-----------|-----------|
| 평균 latency | ~5초 | ~1.5초 (대부분 small/normal) |
| Large Model 호출 비율 | 100% | ~10% |
| 평균 요청당 비용 | $0.028 | $0.009 |
| 비용 절감 | — | 약 68% |
