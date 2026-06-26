# Redis 시맨틱 캐시

## 왜 필요한가

동일하거나 의미적으로 유사한 질문이 반복될 때 LLM을 매번 호출하면:
- 불필요한 토큰 비용 발생 (GPT-4o 기준 입력 $2.50/1M tokens)
- 응답 속도 저하

---

## Exact Cache vs Semantic Cache

| 방식 | 동작 | 한계 |
|------|------|------|
| Exact Cache | 완전히 동일한 문자열만 히트 | "날씨 어때" ≠ "날씨는?" → 미스 |
| **Semantic Cache** | 임베딩 유사도 기반 히트 | 의미 같으면 캐시 재사용 |

---

## 동작 원리

```
입력: "오늘 서울 날씨 알려줘"
    ↓
OpenAI Embeddings → [0.23, -0.41, 0.87, ...]
    ↓
Redis Vector Search (코사인 거리 계산)
    ├─ 거리 < 0.2 → 캐시 히트 → 저장된 응답 즉시 반환
    └─ 거리 ≥ 0.2 → 캐시 미스 → LLM 호출 → 결과 + 벡터 저장
```

유사 질문 예시 (같은 캐시 히트):
- "오늘 서울 날씨 알려줘"
- "서울 오늘 날씨가 어때?"
- "지금 서울 날씨는?"

---

## 구현

```python
# semantic_cache.py
from langchain_community.cache import RedisSemanticCache
from langchain_core.globals import set_llm_cache
from langchain_openai import OpenAIEmbeddings

def init_semantic_cache():
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    cache = RedisSemanticCache(
        redis_url="redis://localhost:6379/0",
        embedding=embeddings,
        score_threshold=0.2,  # 코사인 거리 임계값 (0~2)
    )

    set_llm_cache(cache)  # LangChain 전역 적용 — 모든 LLM 호출에 자동 적용
```

::: tip score_threshold 조정
- `0.1` → 엄격 (거의 동일한 문장만 히트)
- `0.3` → 느슨 (의미 유사면 히트, 정확도 떨어질 수 있음)
- 도메인 특화 서비스일수록 느슨하게 설정 가능
:::

---

## 비용 효과

`set_llm_cache()` 적용 시 **모든 LLM 호출**에 자동 적용.

- FAQ 봇: 반복 질문 많음 → 캐시 히트율 60~80% 가능
- 범용 챗봇: 캐시 히트율 20~40% 수준
- 캐시 히트 시 임베딩 비용만 발생 (LLM 비용 대비 1/100 수준)

---

## 대화 히스토리 세션 저장

```python
# session.py
from langchain_community.chat_message_histories import RedisChatMessageHistory

def get_chat_history(session_id: str):
    return RedisChatMessageHistory(
        session_id=session_id,
        url="redis://localhost:6379/1",
        ttl=3600,            # 1시간 후 자동 만료
        key_prefix="chat_history:",
    )
```

각 사용자 세션의 대화 내용을 Redis에 저장 → 서버 재시작 후에도 히스토리 유지.

---

## Redis DB 분리 이유

```
DB 0: 시맨틱 캐시 (임베딩 벡터, 응답 텍스트)
DB 1: 세션/대화 히스토리
DB 4: Idempotency Key
DB 5: Rate Limiting 카운터
```

DB를 분리하면 `FLUSHDB`로 특정 데이터만 초기화 가능. 용도별 TTL/메모리 정책도 독립 적용 가능.

---

## 관련 파일

- `app/core/cache/semantic_cache.py`
- `app/core/cache/session.py`
- `app/core/cache/redis_manager.py`
