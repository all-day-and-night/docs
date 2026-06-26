# Circuit Breaker 패턴

## 왜 필요한가

Exponential Backoff만으로는 부족한 상황:

```
OpenAI 서버가 완전히 다운된 경우:
  요청 1 → 타임아웃 30초 대기 → 실패
  요청 2 → 타임아웃 30초 대기 → 실패
  요청 3 → 타임아웃 30초 대기 → 실패
  ...

동시 요청 100개 → 100개가 모두 30초씩 대기
→ 스레드/커넥션 고갈
→ 다른 공급자(Bedrock, EKS)까지 영향 받음 (cascade failure)
```

---

## Circuit Breaker 상태 머신

```
         연속 N회 실패
CLOSED ──────────────────► OPEN
(정상, 모든 요청 통과)      (차단, 즉시 503 반환)
    ▲                           │
    │ 요청 성공                  │ reset_timeout 경과
    │                           ▼
    └──────────────────── HALF-OPEN
                          (테스트 요청 1개 허용)
```

| 상태 | 동작 |
|------|------|
| **CLOSED** | 정상 운영, 모든 요청 통과 |
| **OPEN** | 즉시 `CircuitBreakerError` 발생 (타임아웃 없이 빠른 실패) |
| **HALF-OPEN** | 요청 1개 허용 → 성공 시 CLOSED, 실패 시 다시 OPEN |

---

## 구현: pybreaker

```python
# circuit_breaker.py — 공급자별 독립 CB
import pybreaker

openai_breaker = pybreaker.CircuitBreaker(
    fail_max=5,          # 연속 5회 실패 → OPEN
    reset_timeout=30,    # 30초 후 HALF-OPEN
    name="openai",
)

bedrock_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=30, name="bedrock")
local_breaker   = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=30, name="local")
eks_breaker     = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=30, name="eks")
```

**API 레이어에서 CB 상태 확인:**

```python
# routes/llm.py
breaker = BREAKERS.get(body.provider)
if breaker and not breaker.closed:
    raise HTTPException(
        503,
        detail=f"Provider '{body.provider}' is temporarily unavailable"
    )
```

---

## 공급자별 독립 CB의 중요성

```
❌ 공유 CB:
  OpenAI 5회 실패 → CB OPEN → Bedrock도 차단됨

✅ 독립 CB:
  OpenAI CB OPEN → Bedrock CB는 여전히 CLOSED
  → OpenAI 요청은 차단, Bedrock으로 fallback 가능
```

---

## CB 상태 모니터링

```json
// GET /v1/llm/providers
{
  "openai":  {"state": "open",   "fail_counter": 5},
  "bedrock": {"state": "closed", "fail_counter": 0},
  "local":   {"state": "closed", "fail_counter": 1},
  "eks":     {"state": "closed", "fail_counter": 0}
}
```

Prometheus 메트릭으로도 노출:

```python
# CB 상태 변경 시 호출
circuit_breaker_open.labels(provider="openai").set(1)   # OPEN
circuit_breaker_open.labels(provider="openai").set(0)   # CLOSED/HALF-OPEN
```

---

## 관련 파일

- `app/core/llm/circuit_breaker.py`
- `app/api/v1/routes/llm.py`

## 참고

- [Exponential Backoff](./04-exponential-backoff) — CB와 함께 사용하는 재시도 전략
