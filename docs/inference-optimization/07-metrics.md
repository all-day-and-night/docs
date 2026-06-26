# 8단계 — 메트릭 취합 및 성능 개선: vLLM 지표 기반 튜닝

## 문제: 병목이 어디인지 눈으로 볼 수 없다

```
vLLM 내부 병목 4가지:

Queue 병목:   요청이 실행 전 대기 → TTFT(첫 토큰 속도) 악화
Prefill 병목: 입력 처리가 느림   → TTFT 악화, decode 차단
Decode 병목:  출력 생성이 느림   → ITL(토큰 간 지연) 악화, 스트리밍 끊김
KV Cache 압박: 메모리 부족      → preemption 발생, 전체 지연 악화
```

각 병목은 사용자 경험에 다르게 나타난다.

| 병목 | 사용자 증상 | 핵심 지표 |
|------|------------|----------|
| Queue | "응답이 한참 후에 시작됨" | TTFT ↑, queue time ↑ |
| Prefill | "응답은 시작되는데 첫 토큰이 늦음" | TTFT ↑, prefill time ↑ |
| Decode | "스트리밍 중 토큰이 뚝뚝 끊김" | ITL ↑ |
| KV Cache | "부하 많아지면 전반적으로 느려짐" | KV usage ↑, E2E ↑ |

---

## 1. 메트릭 수집 구조

```
Client
  → API Gateway / Router
  → vLLM OpenAI-compatible Server
       ├─ /v1/chat/completions
       ├─ /v1/completions
       └─ /metrics          ← vllm: prefix 메트릭 노출
  → Prometheus (scrape 15s)
       ├─ Grafana Dashboard  ← PromQL 조회
       └─ Alertmanager       ← 임계값 초과 시 알림

GPU 하드웨어 레벨:
  DCGM Exporter → Prometheus → Grafana (GPU Util, VRAM, 온도, 전력)
```

### Kubernetes ServiceMonitor 설정

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: vllm
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: vllm
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
      scrapeTimeout: 10s
```

---

## 2. 핵심 메트릭 목록

| 영역 | Metric | 타입 | 의미 |
|------|--------|------|------|
| **Latency** | `vllm:time_to_first_token_seconds` | Histogram | 첫 토큰까지 걸린 시간 (TTFT) |
| Latency | `vllm:inter_token_latency_seconds` | Histogram | 토큰 간 지연 (ITL / TPOT) |
| Latency | `vllm:e2e_request_latency_seconds` | Histogram | 요청 전체 완료 시간 |
| Latency | `vllm:request_queue_time_seconds` | Histogram | 큐 대기 시간 |
| Latency | `vllm:request_prefill_time_seconds` | Histogram | Prefill 처리 시간 |
| Latency | `vllm:request_decode_time_seconds` | Histogram | Decode 처리 시간 |
| **Request** | `vllm:num_requests_running` | Gauge | 현재 실행 중인 요청 수 |
| Request | `vllm:num_requests_waiting` | Gauge | 대기 중인 요청 수 |
| Request | `vllm:num_requests_swapped` | Gauge | Swapped 상태 요청 수 |
| **KV Cache** | `vllm:kv_cache_usage_perc` | Gauge | KV cache 사용 비율 (0~1) |
| **Token** | `vllm:prompt_tokens_total` | Counter | 누적 prompt token 수 |
| Token | `vllm:generation_tokens_total` | Counter | 누적 generation token 수 |
| Token | `vllm:request_prompt_tokens` | Histogram | 요청별 prompt token 분포 |
| Token | `vllm:request_generation_tokens` | Histogram | 요청별 generation token 분포 |
| **Cache** | `vllm:prefix_cache_hits` | Counter | Prefix cache hit 수 |
| Cache | `vllm:prefix_cache_queries` | Counter | Prefix cache 조회 수 |
| **Success** | `vllm:request_success_total` | Counter | 완료 요청 수 (finish_reason별) |

---

## 3. PromQL 기본 패턴

### Histogram p95

```promql
histogram_quantile(
  0.95,
  sum by (le, model_name) (
    rate(vllm:time_to_first_token_seconds_bucket[5m])
  )
)
```

Latency 지표는 대부분 Histogram이다. `_bucket` suffix + `le` label로 분위수를 계산한다.

### Counter → 초당 처리량

```promql
sum by (model_name) (
  rate(vllm:generation_tokens_total[5m])
)
```

### Gauge → 현재 상태

```promql
avg by (model_name) (
  vllm:kv_cache_usage_perc
)
```

---

## 4. 메트릭별 해석과 트레이드오프 조정

### 4.1 TTFT p95 (첫 토큰 속도)

```promql
histogram_quantile(
  0.95,
  sum by (le, model_name) (
    rate(vllm:time_to_first_token_seconds_bucket[5m])
  )
)
```

**해석**

| 상태 | 의미 |
|------|------|
| TTFT ↑ + queue time ↑ | capacity 부족 또는 동시성 설정 부족 |
| TTFT ↑ + prefill time ↑ | prompt가 길거나 prefill batch 병목 |
| TTFT ↑ + 두 지표 정상 | tokenizer/frontend 병목 가능 |

**조정**

| 상황 | 파라미터 | 방법 | 트레이드오프 |
|------|---------|------|------------|
| prefill 처리량 부족 | `--max-num-batched-tokens` | `4096 → 8192 → 16384` | ITL 악화 가능 |
| 동시성 부족 | `--max-num-seqs` | `64 → 128` | KV cache 압박 증가 |
| 긴 prompt가 짧은 요청 차단 | long-context pool 분리 | router에서 prompt 길이 기준 분기 | pool 운영 복잡도 증가 |
| SLA 요청 우선 처리 | `--scheduling-policy priority` | gateway에서 priority 부여 | 낮은 priority 요청 지연 |

---

### 4.2 ITL p95 (토큰 간 지연 / 스트리밍 품질)

```promql
histogram_quantile(
  0.95,
  sum by (le, model_name) (
    rate(vllm:inter_token_latency_seconds_bucket[5m])
  )
)
```

**해석**

| 상태 | 의미 |
|------|------|
| ITL ↑ | 스트리밍 중 토큰이 끊김 |
| TTFT 낮고 ITL ↑ | 첫 토큰은 빠르지만 decode가 prefill에 밀림 |
| ITL p99만 ↑ | 일부 long request, preemption, batch 불균형 |

**조정**

| 상황 | 파라미터 | 방법 | 트레이드오프 |
|------|---------|------|------------|
| prefill이 decode 방해 | `--max-num-batched-tokens` | `8192 → 4096 → 2048` | TTFT·throughput 저하 |
| 긴 prefill이 decode 차단 | `--enable-chunked-prefill` | chunked prefill 활성화 | long prompt 완료 시간 증가 가능 |
| long prompt 동시성 과다 | `--max-long-partial-prefills` | `2 → 1` | long-context 처리량 감소 |
| partial prefill 과다 | `--max-num-partial-prefills` | `4 → 2 → 1` | prefill throughput 감소 |

---

### 4.3 Queue Time p95 (요청 대기)

```promql
histogram_quantile(
  0.95,
  sum by (le, model_name) (
    rate(vllm:request_queue_time_seconds_bucket[5m])
  )
)
```

보조 패널:

```promql
sum by (model_name) (vllm:num_requests_waiting)
sum by (model_name) (vllm:num_requests_running)
```

**해석**

| 상태 | 의미 |
|------|------|
| queue time ↑ | 처리 용량보다 요청이 많음 |
| waiting ↑, running 낮음 | scheduler·frontend·tokenizer 병목 가능 |
| GPU util 높고 waiting ↑ | 실제 compute capacity 부족 |
| GPU util 낮고 waiting ↑ | 소프트웨어·설정 병목 |

**조정**

| 상황 | 방법 | 트레이드오프 |
|------|------|------------|
| 동시성 부족 | `--max-num-seqs` `64 → 128/256` | KV cache 압박 증가 |
| prefill 처리량 부족 | `--max-num-batched-tokens` `4096 → 8192` | ITL 악화 |
| GPU capacity 부족 | replica / GPU 증설 (scale-out) | 비용 증가 |
| 배치·long-context가 실시간 방해 | pool 분리 (router에서 workload별 routing) | 운영 복잡도 증가 |

---

### 4.4 KV Cache Usage (메모리 압박)

```promql
avg by (model_name, instance) (
  vllm:kv_cache_usage_perc
)
```

**해석**

| 상태 | 의미 |
|------|------|
| 0.90 이상 지속 | preemption·OOM 위험 |
| KV ↑ + prompt tokens ↑ | 긴 입력이 메모리 점유 |
| KV 낮고 queue ↑ | compute·scheduler 병목 (메모리 문제 아님) |

**조정**

| 상황 | 파라미터 | 방법 | 트레이드오프 |
|------|---------|------|------------|
| KV 공간 부족 | `--gpu-memory-utilization` | `0.85 → 0.90 → 0.95` | OOM 위험 증가 |
| 동시성 과다 | `--max-num-seqs` | `128 → 64` | throughput 감소 |
| output이 너무 김 | `max_tokens` 제한 | endpoint별 제한 | 답변 잘림 가능 |
| 모델 weight가 큼 | `--tensor-parallel-size` | `1 → 2/4` | GPU 간 통신 overhead |

---

### 4.5 Token Throughput (처리량)

```promql
# Generation tokens/sec
sum by (model_name) (rate(vllm:generation_tokens_total[5m]))

# Total tokens/sec
sum by (model_name) (
  rate(vllm:prompt_tokens_total[5m])
  + rate(vllm:generation_tokens_total[5m])
)
```

**해석**

| 상태 | 의미 |
|------|------|
| throughput ↑ | GPU 처리량 증가, cost/token 개선 |
| throughput ↓ + GPU idle | batch 부족, memory pressure, queue 문제 |
| throughput 높고 latency 높음 | batch 과대, UX 희생 |
| throughput 낮고 latency 낮음 | latency 중심 설정, GPU 활용 부족 |

**조정**

| 상황 | 파라미터 | 방법 | 트레이드오프 |
|------|---------|------|------------|
| GPU 활용 낮음 | `--max-num-batched-tokens` | `4096 → 8192 → 16384` | ITL 악화 |
| request/sec 낮음 | `--max-num-seqs` | `64 → 128/256` | KV pressure |
| 실시간과 배치 혼재 | batch 전용 pool | batch pool은 큰 batch 설정 | 인프라 복잡도 |
| 비용 절감 필요 | quantization 적용 | FP8/INT8/INT4 검토 | 품질 회귀 가능 |

---

### 4.6 Prefix Cache Hit Rate

```promql
sum by (model_name) (rate(vllm:prefix_cache_hits[5m]))
/
sum by (model_name) (rate(vllm:prefix_cache_queries[5m]))
```

**해석**

| 상태 | 의미 |
|------|------|
| hit rate ↑ | 동일 prefix 재사용 효율 높음, TTFT 개선 |
| hit rate ↓ | prompt prefix가 제각각이거나 routing locality 부족 |
| 낮고 TTFT ↑ | prefill 재사용 실패, 중복 계산 발생 |

**조정**

| 상황 | 방법 | 트레이드오프 |
|------|------|------------|
| system prompt가 매번 다름 | prompt template 정규화 | prompt 유연성 감소 |
| timestamp·user-specific 값이 앞에 위치 | 동적 필드를 뒤로 이동 | 구현 변경 필요 |
| cache locality 부족 | cache-aware routing / sticky routing | 특정 worker 쏠림 가능 |
| RAG chunk 순서 변동 | chunk ordering 안정화 | relevance ordering과 충돌 가능 |

---

## 5. Alert Rule

```yaml
groups:
  - name: vllm-serving
    rules:
      - alert: VllmHighTTFT
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:time_to_first_token_seconds_bucket[5m]))
          ) > 3
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "TTFT p95 > 3s"

      - alert: VllmHighITL
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:inter_token_latency_seconds_bucket[5m]))
          ) > 0.2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "ITL p95 > 200ms"

      - alert: VllmHighQueueTime
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:request_queue_time_seconds_bucket[5m]))
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Queue time p95 > 2s"

      - alert: VllmHighKVCacheUsage
        expr: |
          avg by (model_name, instance) (vllm:kv_cache_usage_perc) > 0.90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "KV cache usage > 90%"

      - alert: VllmWaitingRequestsHigh
        expr: |
          sum by (model_name, instance) (vllm:num_requests_waiting) > 20
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "대기 요청 > 20개"
```

임계값은 모델 크기·GPU 종류·SLA에 따라 반드시 재조정한다.

---

## 6. Recording Rule (대시보드 성능 최적화)

자주 조회하는 복잡한 PromQL을 pre-compute해 Grafana 응답 속도를 높인다.

```yaml
groups:
  - name: vllm-recording
    interval: 30s
    rules:
      - record: vllm:ttft_p95_seconds
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:time_to_first_token_seconds_bucket[5m]))
          )

      - record: vllm:itl_p95_seconds
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:inter_token_latency_seconds_bucket[5m]))
          )

      - record: vllm:e2e_p95_seconds
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:e2e_request_latency_seconds_bucket[5m]))
          )

      - record: vllm:queue_p95_seconds
        expr: |
          histogram_quantile(0.95,
            sum by (le, model_name) (rate(vllm:request_queue_time_seconds_bucket[5m]))
          )

      - record: vllm:generation_tokens_per_second
        expr: |
          sum by (model_name) (rate(vllm:generation_tokens_total[5m]))

      - record: vllm:prefix_cache_hit_rate
        expr: |
          sum by (model_name) (rate(vllm:prefix_cache_hits[5m]))
          /
          sum by (model_name) (rate(vllm:prefix_cache_queries[5m]))
```

---

## 7. 목적별 파라미터 프로파일

### 실시간 Chat / Streaming 우선

```bash
vllm serve <MODEL> \
  --enable-chunked-prefill \
  --max-num-batched-tokens 2048 \
  --max-num-seqs 64 \
  --max-num-partial-prefills 1 \
  --max-long-partial-prefills 1 \
  --long-prefill-token-threshold 4096
```

| 기대 효과 | 트레이드오프 |
|----------|------------|
| ITL / TPOT 개선, streaming UX 부드러움 | throughput 감소, cost/token 증가 가능 |
| 긴 prefill blocking 완화 | 긴 prompt 완료 시간 증가 가능 |

### 균형형 (일반 API)

```bash
vllm serve <MODEL> \
  --enable-chunked-prefill \
  --max-num-batched-tokens 8192 \
  --max-num-seqs 128 \
  --max-num-partial-prefills 2 \
  --max-long-partial-prefills 1 \
  --long-prefill-token-threshold 4096
```

| 기대 효과 | 트레이드오프 |
|----------|------------|
| TTFT와 throughput 균형 | ultra-low latency에는 부족 |
| 일반 업무 요청에 적합 | long-context 많으면 별도 pool 필요 |

### Batch / Throughput 우선

```bash
vllm serve <MODEL> \
  --enable-chunked-prefill \
  --max-num-batched-tokens 16384 \
  --max-num-seqs 256 \
  --max-num-partial-prefills 4 \
  --max-long-partial-prefills 2
```

| 기대 효과 | 트레이드오프 |
|----------|------------|
| tokens/sec/GPU 증가, cost/token 감소 | TTFT·ITL 악화 가능 |
| 배치 요약·비동기 처리 적합 | 실시간 UX 부적합 |

---

## 8. 운영 튜닝 순서

```
1. /metrics 노출 확인
   curl http://vllm-server:8000/metrics | head

2. Prometheus scrape 정상 확인
   → Prometheus UI: Status > Targets

3. Grafana 기본 패널 구성
   TTFT p95 / ITL p95 / E2E p95 / Queue p95
   Running / Waiting / KV cache usage
   Prompt tok/s / Generation tok/s / Prefix hit rate

4. baseline 부하 테스트
   → TTFT·ITL·throughput 기준값 기록

5. max_num_batched_tokens sweep
   2048 → 4096 → 8192 → 16384
   → 각 설정에서 TTFT, ITL, throughput 비교

6. max_num_seqs sweep
   32 → 64 → 128 → 256
   → KV cache usage와 latency 변화 관찰

7. chunked prefill 세부 조정
   → max_num_partial_prefills, long_prefill_token_threshold

8. workload 특성에 따라 pool 분리
   실시간 pool / long-context pool / batch pool

9. Alert threshold 설정
   → TTFT·ITL·queue·KV cache 기준값을 실측값 기반으로 확정

10. canary 후 운영 반영
```

---

## 9. GPU 지표와 함께 보기

vLLM 지표만으로는 GPU hardware 병목을 완전히 파악할 수 없다. DCGM Exporter를 함께 운영한다.

| Metric | 의미 |
|--------|------|
| `DCGM_FI_DEV_GPU_UTIL` | GPU compute 사용률 |
| `DCGM_FI_DEV_FB_USED` | VRAM 사용량 |
| `DCGM_FI_DEV_MEM_COPY_UTIL` | Memory copy 사용률 |
| `DCGM_FI_DEV_POWER_USAGE` | 전력 |
| `DCGM_FI_DEV_GPU_TEMP` | 온도 |

**GPU Util 낮고 Queue 높을 때 가능 원인:**

```
1. tokenizer / API frontend 병목
2. --max-num-seqs 너무 작음
3. --max-num-batched-tokens 너무 작음
4. KV cache 압박으로 scheduler가 요청을 올리지 못함
5. network / proxy 병목
```

---

## 지표 종합 조정 매트릭스

| 지표 | 상향 시 의미 | 우선 확인 | 조정 방향 | 트레이드오프 |
|------|------------|---------|----------|------------|
| TTFT p95 | 첫 응답 지연 | queue time, prefill time | `max_num_batched_tokens` ↑, `max_num_seqs` ↑ | ITL·KV pressure 증가 |
| ITL p95 | 스트리밍 끊김 | prefill 동시성, preemption | `max_num_batched_tokens` ↓, chunked prefill | throughput·TTFT 저하 |
| E2E p95 | 전체 응답 지연 | TTFT, ITL, output length | 원인별 조정 | 원인별 상이 |
| Queue p95 | 대기 증가 | waiting·running·GPU util | `max_num_seqs` ↑, scale-out | 비용·KV 증가 |
| KV cache usage | memory pressure | prompt·output length | `gpu_memory_utilization` ↑ 또는 `max_num_seqs` ↓ | OOM 위험 또는 throughput 감소 |
| Waiting requests | queue 적체 | GPU util, running | 동시성 증가, autoscaling | 비용 증가 |
| Prompt tokens p95 | 긴 입력 증가 | RAG top-k, long request | context 축소, long pool 분리 | 문맥 손실 가능 |
| Generation tokens p95 | 긴 출력 증가 | max_tokens, stop sequence | output 제한 | 답변 잘림 가능 |
| Throughput | 처리량 변화 | GPU util, latency | batch·seq 증가, batch pool | latency 악화 가능 |
| Prefix cache hit | prefix 재사용 | prompt template, routing | template 정규화, sticky routing | load imbalance |

---

## 실험 설계

| 조건 | 구성 |
|------|------|
| A (baseline) | chunked prefill 없음, max_num_seqs 64, max_num_batched_tokens 4096 |
| B (튜닝) | chunked prefill 활성화, max_num_seqs 128, max_num_batched_tokens 8192 |
| C (throughput 우선) | chunked prefill 활성화, max_num_seqs 256, max_num_batched_tokens 16384 |

측정 지표:
- TTFT p95, ITL p95, E2E p95 (latency)
- Generation tokens/sec (throughput)
- KV cache usage 평균 (memory)
- Prefix cache hit rate (재사용 효율)
- GPU Util 평균 (하드웨어 활용도)
