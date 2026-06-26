# 앱 컴포넌트 및 API

## 컴포넌트 구조

```
app/
├── main.py                    # FastAPI 앱 진입점, 미들웨어 등록
├── api/v1/
│   ├── routes/
│   │   ├── chat.py            # 채팅 엔드포인트
│   │   ├── health.py          # 헬스체크
│   │   └── llm.py             # LLM 직접 호출
│   └── middleware/
│       └── rate_limit.py      # slowapi Rate Limiter
├── chains/
│   ├── chat_chain.py          # LangChain 체인 조립 + 세션 저장
│   └── prompts/templates.py   # 프롬프트 템플릿
├── core/
│   ├── config.py              # pydantic-settings 기반 설정
│   ├── cache/
│   │   ├── semantic_cache.py  # Redis 시맨틱 캐시 초기화
│   │   ├── session.py         # RedisChatMessageHistory
│   │   ├── redis_manager.py   # Redis 연결 관리
│   │   └── dedup.py           # Idempotency (중복 방지)
│   ├── llm/
│   │   ├── factory.py         # LLM 팩토리 + with_retry
│   │   ├── circuit_breaker.py # pybreaker Circuit Breaker
│   │   └── providers/         # OpenAI / Bedrock / Ollama / EKS
│   └── messaging/
│       ├── kafka_producer.py  # aiokafka 발행
│       ├── kafka_consumer.py  # aiokafka 소비
│       ├── stream_producer.py # Redis Streams XADD (청크 발행)
│       └── stream_consumer.py # Redis Streams XREAD BLOCK (청크 수신)
├── workers/
│   ├── celery_app.py          # Celery 앱 + Beat 스케줄
│   ├── celery_tasks.py        # Celery 태스크 정의
│   └── kafka_worker.py        # Kafka 컨슈머 루프
└── utils/
    ├── metrics.py             # Prometheus Counter/Histogram
    ├── tracing.py             # OpenTelemetry 설정
    └── streaming.py           # SSE 제너레이터
```

## API 흐름

### 동기 채팅 (`POST /v1/chat/completions`)
```
Request → Rate Limit 체크
        → SemanticCache 조회 (Redis 벡터 검색)
        → 캐시 미스 시 LLM 호출 (Circuit Breaker + Retry)
        → 세션 히스토리 저장 (Redis DB1)
        → Response
```

### 비동기 채팅 (`POST /v1/chat/async`)
```
Request → Idempotency 체크 (job_id 중복 방지)
        → Kafka llm-requests 토픽 발행
        → job_id 즉시 반환

Kafka Worker: llm-requests 소비
           → chat_stream() 청크 단위 실행
           → 청크마다 XADD stream:llm:{job_id} (Redis Streams)
           → 완료 시 XADD {type:end}
           → 완성 결과 Redis SET (llm:result:{job_id})

Client: GET /v1/chat/stream/{job_id} → XREAD BLOCK SSE (청크 단위 실시간)
     or GET /v1/chat/job/{job_id}    → Redis GET 폴링 (완성 결과)
```

### SSE 스트리밍 (`POST /v1/chat/stream/direct`)
```
Request → LLM.astream() → 토큰 단위 yield → SSE EventSource
```

## LLM Provider 선택 구조

```python
class LLMProvider(str, Enum):
    OPENAI  = "openai"   # langchain_openai.ChatOpenAI
    BEDROCK = "bedrock"  # langchain_aws.ChatBedrock
    LOCAL   = "local"    # langchain_ollama.ChatOllama
    EKS     = "eks"      # ChatOpenAI (OpenAI 호환 엔드포인트)
```

`LLMFactory.create_with_retry(provider)` → `llm.with_retry(...)` 적용된 Runnable 반환.
동일 provider+streaming 조합은 `@lru_cache`로 인스턴스 재사용.

## Celery 태스크

| 태스크 | 큐 | 트리거 | 재시도 |
|--------|-----|--------|--------|
| `process_batch_llm_request` | `llm` | 직접 호출 | 지수 백오프 6회 |
| `embed_and_store_document` | `embedding` | 직접 호출 | 지수 백오프 4회 |
| `cleanup_expired_sessions` | `maintenance` | Beat (매일 새벽 3시) | 없음 |
| `retry_failed_llm_call` | - | DLQ 재처리 | 지수 백오프 5회 |

## Redis DB 용도

| DB | 용도 | 사용 라이브러리 |
|----|------|----------------|
| 0 | 시맨틱 캐시 (벡터 인덱스) | RedisSemanticCache + RediSearch |
| 1 | 세션 히스토리 | RedisChatMessageHistory |
| 2 | Celery Broker | Celery |
| 3 | Celery Backend (결과) | Celery |
| 4 | Idempotency (job_id dedup) | 직접 구현 |
| 5 | Rate Limit 카운터 | slowapi |
| 6 | Redis Streams (LLM 청크) | redis.asyncio XADD/XREAD |

> 시맨틱 캐시(DB0)는 RediSearch 모듈 필요 → `redis/redis-stack-server` 이미지 사용.
> 일반 `redis:alpine`은 RediSearch 없어서 `ValueError: Redis failed to connect` 발생.

## 관련 노트
- [개요 및 배포 전략](./00-overview)
- [트러블슈팅 모음](./04-troubleshooting)
- [Redis Streams 상세 구현](../07-redis-streams)
