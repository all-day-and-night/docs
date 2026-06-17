# Rate Limiting — 요청 속도 제한

## 왜 필요한가

- 특정 클라이언트가 과도한 요청으로 LLM 공급자 **TPM(분당 토큰) 한도** 소진
- 다른 클라이언트 서비스 품질 저하
- DDoS 또는 의도치 않은 루프로 인한 비용 폭발

---

## Token Bucket 알고리즘

```
버킷 용량: burst 크기 (예: 20)
토큰 보충: rate 속도로 지속 보충 (예: 60/분 = 1/초)

요청 도착 → 버킷에 토큰 있으면 토큰 차감 후 통과
           → 토큰 없으면 429 Too Many Requests 반환
```

**장점:** 순간적인 burst는 허용하되 지속적인 과부하는 차단.

---

## 구현: slowapi + Redis

```python
# middleware/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,           # IP 기반 제한
    default_limits=["60/minute"],
    storage_uri="redis://localhost:6379/5", # Redis에 카운터 저장
)
```

```python
# 엔드포인트별 개별 제한
@router.post("/chat/completions")
@limiter.limit("30/minute")   # 동기 LLM 호출 — 엄격
async def chat_completions(...): ...

@router.post("/chat/async")
@limiter.limit("60/minute")   # 비동기 처리 — 느슨
async def chat_async(...): ...

@router.post("/chat/stream/direct")
@limiter.limit("20/minute")   # 스트리밍 커넥션 점유 — 가장 엄격
async def chat_stream_direct(...): ...
```

---

## 엔드포인트별 차등 제한

| 엔드포인트 | 제한 | 이유 |
|------------|------|------|
| `POST /chat/completions` | 30/분 | 동기 LLM 호출, 비용/리소스 큼 |
| `POST /chat/async` | 60/분 | 비동기 처리 → 빠름 |
| `POST /chat/stream/direct` | 20/분 | 스트리밍 커넥션 장시간 점유 |
| `POST /llm/proxy` | 60/분 | 직접 LLM 프록시 |

---

## key_func 확장 전략

IP 기반 외에 API 키, 사용자 ID 기반으로도 적용 가능:

```python
def get_api_key(request: Request) -> str:
    return request.headers.get("X-API-Key", get_remote_address(request))

limiter = Limiter(key_func=get_api_key)
```

---

## 429 응답 처리

```python
# main.py
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

클라이언트는 `Retry-After` 헤더를 확인하여 대기 후 재시도.

---

## 관련 파일

- `app/api/v1/middleware/rate_limit.py`
- `app/main.py`
