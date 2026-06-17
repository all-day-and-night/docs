# 1단계 — 서빙 엔진: Transformers → vLLM

---

## 문제: Hugging Face Transformers 직접 추론의 한계

```
FastAPI
 ↓
model.generate(input_ids, ...)   ← 블로킹, 한 번에 요청 1개만 처리
 ↓
응답 반환
```

**핵심 문제 두 가지**
1. **순차 처리** — 한 요청이 생성 중일 때 나머지 요청은 모두 큐에서 대기
2. **정적 메모리 할당** — 최대 컨텍스트 길이 기준으로 GPU 메모리를 미리 예약 → 낭비

### 근본 원인: 정적 KV Cache 할당

```
요청 A  [████░░░░░░░░░░░░]  2048토큰 예약, 실제 512토큰 사용
요청 B  [████████░░░░░░░░]  2048토큰 예약, 실제 1024토큰 사용
요청 C  ❌ 연속 메모리 부족 → 대기
```

남은 메모리가 있어도 **단편화(fragmentation)** 때문에 요청 C가 시작조차 못 한다.  
메모리 낭비율이 평균 **55%**에 달한다.

---

## 해결책 1: PagedAttention

vLLM은 OS의 가상 메모리 페이징에서 착안한 **PagedAttention**으로 이 문제를 해결한다.

GPU 메모리를 고정 크기 **블록** (예: 토큰 16개 단위)으로 분할한다.

```
물리 메모리 블록:
┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│  B0  │  B1  │  B2  │  B3  │  B4  │  B5  │  B6  │  B7  │
└──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘

요청 A → B0, B2, B5   (비연속이어도 됨)
요청 B → B1, B4
요청 C → B3, B6, B7   ← 이제 즉시 수용 가능
```

- 블록은 토큰이 생성될 때마다 **동적으로** 할당 → 미리 예약 불필요
- 비연속 메모리도 활용 가능 → 단편화 거의 없음
- 메모리 낭비율 **55% → 4% 이하**로 감소

---

## 해결책 2: Continuous Batching

기존 정적 배치는 배치가 모두 완료될 때까지 기다린다.

```
정적 배치:
[요청A 완료] [요청B 완료] [요청C 완료]
→ 배치 처리 → 전체 반환 → 다음 배치 대기
                            ↑ GPU 유휴 상태
```

vLLM은 **Continuous Batching** (이터레이션 레벨 스케줄링)을 사용한다.

```
Step 1: [A 1번째토큰] [B 1번째토큰] [C 1번째토큰]
Step 2: [A 2번째토큰] [B 2번째토큰] [C 2번째토큰] [D 1번째토큰]  ← D가 중간에 합류
Step 3: [A 3번째토큰]               [C 3번째토큰] [D 2번째토큰]  ← B 완료, 슬롯 반환
```

슬롯이 비는 즉시 새 요청이 배치에 합류 → **GPU 활용률이 높게 유지**된다.

---

## 아키텍처 변경

```
[Baseline]
FastAPI  →  Hugging Face Transformers  →  LLM

[개선 후]
FastAPI  →  vLLM OpenAI 호환 API  →  LLM
              (PagedAttention + Continuous Batching)
```

코드 변경은 최소화된다.

```python
# 변경 전
outputs = model.generate(input_ids, max_new_tokens=512)

# 변경 후
response = openai_client.chat.completions.create(
    model="mistral-7b",
    messages=[{"role": "user", "content": prompt}],
    stream=True,
)
```

---

## 실행 명령

```bash
pip install vllm

vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
  --host 0.0.0.0 \
  --port 8000 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.85

# 튜닝 옵션
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
  --max-num-seqs 256 \
  --max-num-batched-tokens 4096 \
  --scheduler-delay-factor 0.1
```

---

## 예상 성능 개선

| 동시 요청 수 | Transformers P95 | vLLM P95 | 처리량 개선 |
|-------------|-----------------|----------|------------|
| 1           | ~2초            | ~2초     | ~1x (유사) |
| 10          | ~18초           | ~4초     | ~4.5x      |
| 50          | 타임아웃        | ~8초     | 큰 차이    |
| 100         | 타임아웃        | ~15초    | 큰 차이    |

> 단일 사용자 latency는 비슷하다. 차이는 오직 **동시 처리 처리량**에서 나타난다.

---

## 메트릭 확인

```bash
# 현재 처리 중인 요청 수 확인
curl http://localhost:8000/metrics | grep vllm:num_requests_running
# vllm:num_requests_running 12
# vllm:num_requests_waiting 3
```
