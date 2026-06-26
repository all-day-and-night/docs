# Exponential Backoff 재시도

## 왜 필요한가

LLM API 오류 유형별 재시도 여부:

| 오류 | HTTP | 원인 | 재시도 여부 |
|------|------|------|-------------|
| `RateLimitError` | 429 | 토큰/요청 한도 초과 | ✅ 대기 후 재시도 |
| `APITimeoutError` | 408/504 | 응답 지연 | ✅ |
| `APIConnectionError` | - | 네트워크 단절 | ✅ |
| `InternalServerError` | 500/503 | 공급자 내부 오류 | ✅ |
| `AuthenticationError` | 401 | 키 오류 | ❌ 즉시 실패 |
| `BadRequestError` | 400 | 잘못된 요청 | ❌ 즉시 실패 |

---

## Thundering Herd 문제

Jitter 없이 동시에 실패한 N개 요청이 동일 시간에 재시도하면:

```
t=0s  → 100개 동시 요청 → 전부 RateLimitError
t=2s  → 100개 동시 재시도 → 또 전부 실패
t=4s  → 100개 동시 재시도 → 또 전부 실패 → 악순환
```

**해결: Jitter 추가** → 재시도 시점을 랜덤하게 분산

```
t=2.1s, 2.3s, 1.8s, 2.7s, ... → 분산 재시도 → 일부 성공
```

---

## 3계층 재시도 구조

```
계층 1  LangChain with_retry()    — 체인 레벨 (LCEL)
계층 2  tenacity @retry           — provider 레벨 (세밀한 제어)
계층 3  Celery autoretry_for      — 배치 태스크 레벨
```

### 계층 1 — LangChain with_retry()

```python
# factory.py
llm_with_retry = llm.with_retry(
    retry_if_exception_type=(RateLimitError, APIConnectionError, APITimeoutError),
    wait_exponential_jitter=True,   # jitter 자동 적용
    stop_after_attempt=4,
)
```

### 계층 2 — tenacity (provider 레벨)

```python
# openai_provider.py
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    #                               ▲        ▲     ▲
    #                             배수     최소   최대 대기(초)
    # 재시도 간격: 2s → 4s → 8s → 16s → 32s → 60s(이후 고정)
    stop=stop_after_attempt(5),
    reraise=True,  # 최종 실패 시 원래 예외 재발생
)
async def _call_llm(self, messages): ...
```

**Bedrock ThrottlingException 처리:**

```python
from botocore.exceptions import ClientError

@retry(
    retry=retry_if_exception_type(ClientError),
    wait=wait_exponential(multiplier=2, min=3, max=60),
    stop=stop_after_attempt(5),
)
async def _call_bedrock(self, messages): ...
```

### 계층 3 — Celery

```python
# celery_tasks.py
@celery_app.task(
    autoretry_for=(RateLimitError, APIConnectionError, APITimeoutError),
    retry_backoff=True,      # 지수 백오프 자동 적용
    retry_backoff_max=120,   # 최대 대기 120초
    retry_jitter=True,       # ±랜덤 지터
    max_retries=6,
    default_retry_delay=2,
)
def process_batch_llm_request(self, payload): ...
```

Celery 재시도 간격 계산:

```
시도 1 → 실패 → 2s 대기
시도 2 → 실패 → 4s 대기  (+jitter: ±20%)
시도 3 → 실패 → 8s 대기
시도 4 → 실패 → 16s 대기
시도 5 → 실패 → 32s 대기
시도 6 → 실패 → 64s (max=120으로 제한)
시도 7 → max_retries 초과 → Celery FAILURE 상태로 전환
```

---

## 계층별 역할 분리

| 계층 | 적용 대상 | 재시도 시간 |
|------|-----------|-------------|
| LangChain | 동기 API 경로 (빠른 재시도) | 초 단위 |
| tenacity | provider 직접 호출 시 | 초~분 단위 |
| Celery | 배치, 비동기 백그라운드 | 분 단위 |

---

## 관련 파일

- `app/core/llm/providers/openai_provider.py`
- `app/core/llm/providers/bedrock_provider.py`
- `app/core/llm/factory.py`
- `app/workers/celery_tasks.py`
