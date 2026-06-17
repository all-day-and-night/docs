# 5단계 — 캐싱: 모델 호출 자체를 줄이기

---

## 문제: 동일한 요청에 반복 추론은 낭비다

```
캐시 없는 경우:
  "웹툰 업로드 방법이 뭔가요?" → vLLM 추론 → $0.001, 2초
  "웹툰 업로드 방법이 뭔가요?" → vLLM 추론 → $0.001, 2초  ← 동일 질문!
  "웹툰 업로드 방법이 뭔가요?" → vLLM 추론 → $0.001, 2초  ← 또 동일 질문!

캐시 적용:
  "웹툰 업로드 방법이 뭔가요?" → vLLM 추론 → Redis 저장 → $0.001, 2초
  "웹툰 업로드 방법이 뭔가요?" → Redis 조회 → $0.000, 5ms ← 99% 빠름
```

---

## 캐싱이 효과적인 시나리오

| 시나리오 | 예시 |
|---------|------|
| 정형 FAQ | "환불 정책은?", "작가 신청 방법은?" |
| 반복 시스템 프롬프트 | 매 요청마다 동일한 캐릭터 설정 조회 |
| 동일 세계관 설정 | 캐릭터 이름, 배경, 관계도 |
| RAG 검색 결과 | 동일 질문에 동일 문서가 반복 검색됨 |

---

## 캐시 구조 1: Response Cache (Redis)

응답 결과 전체를 캐시에 저장한다.

```
요청
 ↓
Cache Key 생성 (요청 해시)
 ↓
Redis 조회
 ├─ Hit  → Redis 응답 반환          ← 모델 호출 없음
 └─ Miss → vLLM 추론 → Redis 저장 → 응답 반환
```

### 캐시 키 설계

```python
import hashlib, json

def make_cache_key(messages: list, model: str) -> str:
    payload = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return f"llm:response:{hashlib.sha256(payload.encode()).hexdigest()}"
```

### TTL 설정 전략

| 콘텐츠 유형 | TTL | 이유 |
|-----------|-----|------|
| FAQ, 정책 안내 | 24시간 | 자주 바뀌지 않음 |
| 캐릭터/세계관 설정 | 1시간 | 업데이트 가능성 있음 |
| 실시간 정보 | 캐시 불가 | "지금 인기 웹툰은?" 등 |
| 사용자 개인화 응답 | 캐시 불가 | 사용자별로 다름 |

---

## 캐시 구조 2: RAG 검색 결과 Cache

동일한 질문에 대해 벡터 DB 검색 결과를 캐시한다.

```
사용자 질문
 ↓
임베딩 생성 (Embedding 모델) ← 약 1ms
 ↓
임베딩 해시 → Redis 조회
 ├─ Hit  → 캐시된 검색 결과 반환      ← 벡터 DB 조회 없음
 └─ Miss → 벡터 DB 검색(~20~50ms) → Redis 저장 → 결과 반환
```

---

## 캐시 구조 3: vLLM Prefix Caching (KV Cache 재사용)

vLLM 0.4+에서 지원. 동일한 프롬프트 접두사(prefix)를 가진 요청은 **KV Cache를 재사용**한다.

```
요청 A: [시스템 프롬프트] + [질문 A]
         ─────────────────
         이 부분의 KV Cache 저장

요청 B: [시스템 프롬프트] + [질문 B]
         ─────────────────
         이 부분 KV Cache 재사용 → Prefill 시간 절약
```

```bash
# vLLM에서 Prefix Caching 활성화
vllm serve mistral-7b --enable-prefix-caching
```

---

## FastAPI Response Cache 구현

```python
# cache_server.py
import redis.asyncio as aioredis
import hashlib, json, time
from openai import AsyncOpenAI
from fastapi import FastAPI
from prometheus_client import Counter, Histogram

app = FastAPI()
redis_client = aioredis.Redis(host="redis", port=6379, decode_responses=True)
vllm_client  = AsyncOpenAI(base_url="http://vllm:8000/v1", api_key="dummy")

cache_hits   = Counter("cache_hits_total",   "캐시 히트 수")
cache_misses = Counter("cache_misses_total", "캐시 미스 수")
latency_hist = Histogram("response_seconds", "응답 시간", ["source"])

def make_cache_key(messages: list, model: str) -> str:
    payload = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return f"llm:resp:{hashlib.sha256(payload.encode()).hexdigest()}"

@app.post("/chat")
async def chat(messages: list, model: str = "mistral-7b", ttl: int = 3600):
    key = make_cache_key(messages, model)
    start = time.perf_counter()

    cached = await redis_client.get(key)
    if cached:
        cache_hits.inc()
        latency_hist.labels(source="cache").observe(time.perf_counter() - start)
        return {"source": "cache", "response": cached}

    cache_misses.inc()
    resp = await vllm_client.chat.completions.create(
        model=model, messages=messages, max_tokens=512
    )
    result = resp.choices[0].message.content

    if ttl > 0:
        await redis_client.setex(key, ttl, result)

    latency_hist.labels(source="model").observe(time.perf_counter() - start)
    return {"source": "model", "response": result}
```

---

## Cache Hit Ratio 확인

```bash
redis-cli info stats | grep -E "keyspace_hits|keyspace_misses"
# keyspace_hits:   18423
# keyspace_misses:  9812
# Hit Ratio = 18423 / (18423 + 9812) = 65.2%
```

---

## 예상 결과

| 지표 | 캐시 없음 | 캐시 적용 (Hit 40%) |
|------|---------|-------------------|
| 평균 응답 시간 | ~2초 | ~1.2초 |
| 모델 호출 횟수 | 100% | 60% |
| P95 latency | ~5초 | ~3초 |
| 요청당 비용 | $0.001 | $0.0006 |
| 비용 절감 | — | ~40% |
