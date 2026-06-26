# Celery 백그라운드 처리

## FastAPI vs Kafka Worker vs Celery 역할 분리

| 레이어 | 역할 | 특징 |
|--------|------|------|
| **FastAPI** | 실시간 HTTP API | 비동기, 낮은 레이턴시 (ms) |
| **Kafka Worker** | LLM 비동기 처리 | 고처리량, 메시지 순서 보장 |
| **Celery** | 배치/주기/재처리 작업 | 재시도, 스케줄링, 우선순위 큐 |

---

## 셋업

```python
# celery_app.py
celery_app = Celery(
    broker="redis://localhost:6379/2",    # 작업 큐
    backend="redis://localhost:6379/3",   # 결과 저장
    include=["app.workers.celery_tasks"],
)

celery_app.conf.update(
    task_acks_late=True,            # 처리 완료 후 ACK → 크래시 시 재처리 보장
    worker_prefetch_multiplier=1,   # 공정한 작업 분배 (long-running 필수)
)
```

**큐 분리:**

```python
task_routes = {
    "process_batch_llm_request": {"queue": "llm"},
    "embed_and_store_document":  {"queue": "embedding"},
    "cleanup_expired_sessions":  {"queue": "maintenance"},
}
```

큐마다 워커 수와 concurrency를 독립 조정 가능.

---

## 주요 태스크

### 배치 LLM 처리 + 자동 지수 백오프

```python
@celery_app.task(
    autoretry_for=(RateLimitError, APIConnectionError, APITimeoutError),
    retry_backoff=True,       # 지수 백오프 자동
    retry_backoff_max=120,    # 최대 120초
    retry_jitter=True,        # ±랜덤 지터
    max_retries=6,
)
def process_batch_llm_request(self, payload: dict):
    result = asyncio.run(          # get_event_loop()는 Python 3.10+ deprecated
        chat_invoke(
            session_id=payload["session_id"],
            user_input=payload["input"],
            provider=LLMProvider(payload.get("provider", "openai")),
        )
    )
    return {"job_id": payload["job_id"], "result": result}
```

### 문서 임베딩

```python
@celery_app.task(
    autoretry_for=(RateLimitError,),
    retry_backoff=True,
    max_retries=4,
)
def embed_and_store_document(self, document_id: str, content: str):
    # 임베딩 생성 + 벡터 스토어 저장
    ...
```

### 주기 정리 (Celery Beat)

```python
# celery_app.py
beat_schedule = {
    "cleanup-expired-sessions": {
        "task": "cleanup_expired_sessions",
        "schedule": crontab(hour=3, minute=0),  # 매일 새벽 3시
    },
}
```

```python
@celery_app.task
def cleanup_expired_sessions():
    # TTL 없는 세션 키에 TTL 재설정
    async for key in client.scan_iter("chat_history:*"):
        if await client.ttl(key) == -1:
            await client.expire(key, 3600)
```

---

## task_acks_late 중요성

```
task_acks_late=False (기본):
  큐에서 메시지 꺼냄 → 즉시 ACK → 처리 중 워커 크래시 → 메시지 유실

task_acks_late=True:
  큐에서 메시지 꺼냄 → 처리 완료 후 ACK → 크래시 시 미처리 메시지 재큐
```

LLM 처리는 시간이 길어 크래시 위험이 있으므로 반드시 `True`.

---

## 실행

```bash
# 일반 워커
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4

# 큐별 워커 (권장)
celery -A app.workers.celery_app worker -Q llm --concurrency=2
celery -A app.workers.celery_app worker -Q embedding --concurrency=4

# Beat (스케줄러)
celery -A app.workers.celery_app beat --loglevel=info
```

---

## 관련 파일

- `app/workers/celery_app.py`
- `app/workers/celery_tasks.py`
