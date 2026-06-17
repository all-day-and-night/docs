# Observability — 관측 가능성

## 3가지 축

```
Logs    → "무슨 일이 있었나?"    (사건 기록)
Metrics → "얼마나 자주/느리게?" (수치 집계)
Traces  → "어디서 느려졌나?"    (요청 추적)
```

---

## 1. Structured Logging (structlog)

일반 텍스트 로그 대신 JSON 형식으로 구조화:

```python
# utils/logging.py
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)
```

출력 예시:

```json
{
  "timestamp": "2026-06-07T10:23:45.123Z",
  "level": "info",
  "event": "LLM request processed",
  "job_id": "a1b2c3",
  "provider": "openai",
  "duration_ms": 1240,
  "tokens": 512,
  "retry_count": 1,
  "cache_hit": false,
  "session_id": "user-xyz"
}
```

ELK, CloudWatch, Loki 등에서 필드 기반 쿼리 가능:

```
provider="bedrock" AND retry_count>0 → Bedrock 재시도 발생 요청만 필터
```

---

## 2. Prometheus Metrics

```python
# utils/metrics.py
llm_request_duration = Histogram(
    "llm_request_duration_seconds",
    "LLM 요청 처리 시간",
    ["provider", "model"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
)

llm_retry_total   = Counter("llm_retry_total",   "재시도 횟수", ["provider", "reason"])
llm_error_total   = Counter("llm_error_total",   "에러 횟수",   ["provider", "error_type"])
cache_hit_total   = Counter("cache_hit_total",   "캐시 히트",   ["cache_type"])
cache_miss_total  = Counter("cache_miss_total",  "캐시 미스",   ["cache_type"])
circuit_breaker_open = Gauge("circuit_breaker_open", "CB OPEN 여부 (1=open, 0=closed)", ["provider"])
```

`/metrics` 엔드포인트 노출 → Prometheus 수집 → Grafana 시각화:

```python
# main.py
from prometheus_client import make_asgi_app
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

---

## 3. OpenTelemetry 분산 트레이싱

```python
# utils/tracing.py
def configure_tracing(app, service_name, otlp_endpoint):
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint))
    )
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)   # HTTP 요청 자동 계측
    HTTPXClientInstrumentor().instrument()    # LLM API 호출 자동 계측
```

트레이스 예시:

```
POST /v1/chat/completions         [3.2s]
  └─ LangChain chain.ainvoke      [3.1s]
       └─ OpenAI API call         [3.0s]  ← 여기서 느림 확인 가능
```

---

## Grafana 대시보드 핵심 패널

| 패널 | 쿼리 | 목적 |
|------|------|------|
| LLM P95 레이턴시 | `histogram_quantile(0.95, llm_request_duration_seconds_bucket)` | SLA 모니터링 |
| 공급자별 에러율 | `rate(llm_error_total[5m])` by provider | 공급자 상태 |
| 캐시 히트율 | `rate(cache_hit_total[5m]) / (rate(cache_hit_total[5m]) + rate(cache_miss_total[5m]))` | 캐시 효율 |
| Circuit Breaker 상태 | `circuit_breaker_open` by provider | 공급자 장애 감지 |
| 재시도 빈도 | `rate(llm_retry_total[5m])` | 불안정 공급자 탐지 |

---

## 알람 설정 예시 (Grafana Alerting)

```yaml
# LLM 에러율이 5% 초과 시 알람
- alert: HighLLMErrorRate
  expr: rate(llm_error_total[5m]) / rate(llm_request_duration_seconds_count[5m]) > 0.05
  for: 2m
  annotations:
    summary: "LLM error rate is {{ $value | humanizePercentage }}"

# Circuit Breaker OPEN 시 즉시 알람
- alert: CircuitBreakerOpen
  expr: circuit_breaker_open == 1
  for: 0m
  labels:
    severity: critical
```

---

## 관련 파일

- `app/utils/logging.py`
- `app/utils/metrics.py`
- `app/utils/tracing.py`
- `infra/prometheus/prometheus.yml`
