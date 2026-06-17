# Idempotency Key — 중복 요청 방지

## 왜 필요한가

네트워크 재시도, 클라이언트 중복 클릭, Kafka 재발행 등으로 동일 요청이 여러 번 들어올 때:
- LLM을 중복 호출 → 비용 낭비
- 동일 메시지가 대화 히스토리에 2번 저장 → 이상한 응답

---

## 해결: Redis SET NX (Atomic)

`SET key value NX EX ttl` — **키가 없을 때만 세팅** (원자적 연산)

```python
# dedup.py
async def is_duplicate(request_id: str) -> bool:
    result = await client.set(
        f"dedup:{request_id}",
        "1",
        nx=True,   # Not eXists — 키 없을 때만 세팅
        ex=300,    # 5분 TTL
    )
    # result = True  → 새로 세팅됨 → 첫 요청 (처리 진행)
    # result = None  → 이미 존재 → 중복 요청 (차단)
    return result is None
```

### 레이스 컨디션 없는 이유

Redis `SET NX`는 **단일 명령**으로 check-and-set이 원자적으로 처리됨.

```
요청 A, B가 동시에 도달:
  A: SET dedup:abc 1 NX → True  (세팅 성공 → 처리)
  B: SET dedup:abc 1 NX → None  (이미 존재 → 차단)
  ─ 두 요청이 동시에 도달해도 하나만 통과
```

---

## 처리 흐름

```python
# chat.py (FastAPI 라우터)
async def chat_async(body: AsyncChatRequest):
    if await is_duplicate(body.job_id):
        raise HTTPException(409, f"Duplicate request: {body.job_id}")

    await publish_llm_request({...})
    return AsyncChatResponse(job_id=body.job_id, ...)
```

처리 완료 후 키 삭제:

```python
async def mark_complete(request_id: str):
    await client.delete(f"dedup:{request_id}")
    # 이후 동일 job_id로 재요청하면 정상 처리됨
```

---

## TTL 설정 전략

| TTL | 의미 |
|-----|------|
| 300초 (5분) | 짧은 시간 내 중복 방지 (기본값) |
| 3600초 (1시간) | 배치 작업 중복 방지 |
| -1 (영구) | 처리 완료 후 수동 삭제 필요 |

::: warning
TTL 없이 영구 저장하면 Redis 메모리 무한 증가. 반드시 TTL 설정.
:::

---

## 관련 파일

- `app/core/cache/dedup.py`
