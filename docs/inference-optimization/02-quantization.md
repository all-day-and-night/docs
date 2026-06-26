# 2단계 — 양자화: FP16 vs AWQ vs GPTQ

---

## 문제: FP16 모델의 VRAM 한계

FP16(16비트 부동소수점) 기준 7B 파라미터 모델의 VRAM 사용량:

```
7B 파라미터 × 2바이트 (FP16) = 약 14GB VRAM
```

- 16GB GPU에 모델 하나를 겨우 올릴 수 있고, KV Cache 공간이 거의 없음
- 여러 모델을 동시에 운영하거나 큰 배치를 처리할 수 없음
- 비싼 GPU 인스턴스를 반드시 사용해야 함

---

## 양자화란?

모델 가중치를 표현하는 **비트 수를 줄이는** 기법이다.

```
FP16  → 가중치당 16비트  → 높은 정밀도, 높은 메모리 사용
INT8  → 가중치당  8비트  → 메모리 절반, 약간의 품질 저하
INT4  → 가중치당  4비트  → 메모리 1/4, 측정 가능한 품질 저하
```

핵심 과제는 모델 품질을 크게 손상시키지 않으면서 양자화하는 것.  
AWQ, GPTQ 같은 현대적 양자화 방법은 **캘리브레이션 데이터**를 활용해 정확도 손실을 최소화한다.

---

## AWQ — 활성화 인식 가중치 양자화

샘플 입력을 모델에 통과시켜 **어떤 가중치가 중요한지** 파악한다.  
중요한 가중치는 더 높은 정밀도로 유지하고, 나머지는 적극적으로 양자화한다.

```
캘리브레이션 단계:
  128개 샘플 프롬프트를 FP16 모델에 통과
  → 중요 가중치 채널 식별
  → 해당 채널 스케일 조정 후 양자화
  → 전체 가중치를 4비트로 양자화

결과: 4비트 크기에 FP16에 근접한 품질 달성
```

7B 모델 VRAM 비교:

```
FP16      → 약 14GB
AWQ 4-bit → 약  4GB   ← 3.5배 감소
```

---

## GPTQ — 생성형 사전학습 트랜스포머 양자화

헤시안(Hessian, 2차 기울기 정보)을 활용하여 레이어별로 가중치를 양자화한다.  
각 레이어의 출력을 재구성하여 양자화로 인한 오차를 최소화한다.

```
각 레이어별:
  손실에 대한 가중치의 헤시안 계산
  가중치를 열 단위로 하나씩 양자화
  나머지 가중치를 오차 보정을 위해 업데이트
```

AWQ와 GPTQ 모두 4비트를 목표로 하지만 오차 최소화 전략이 다르다.  
실제로는 **AWQ가 로딩 속도가 빠르고 추론도 약간 더 빠른** 경향이 있다.

---

## 메모리 사용량 비교

| 형식 | 7B 모델 VRAM | 13B 모델 VRAM | 16GB GPU 탑재 가능? |
|------|------------|--------------|-------------------|
| FP16 | ~14GB | ~26GB | 7B 겨우, 13B 불가 |
| GPTQ 4-bit | ~4.5GB | ~8.5GB | 둘 다 가능 |
| AWQ 4-bit  | ~4.0GB | ~8.0GB | 둘 다 가능 |

4비트 양자화로 16GB GPU를 사용할 경우:
- 남은 ~12GB를 KV Cache에 활용 가능 → 더 많은 동시 요청 처리
- FP16에서 불가능했던 **13B 모델 운영 가능**
- 더 저렴한 GPU 인스턴스(예: 8GB VRAM)로도 운영 가능

---

## 품질 vs 속도 트레이드오프

```
FP16      → 최고 품질, 최고 비용
AWQ 4-bit → FP16 대비 품질 97~99% 유지, VRAM 3.5배 절감, 속도 유사
GPTQ 4-bit → FP16 대비 품질 96~98% 유지, VRAM 3.5배 절감, 속도 유사
```

대부분의 챗봇 사용 사례에서 품질 차이는 체감하기 어렵다.

---

## 실행 명령

```bash
# FP16 기준
vllm serve mistralai/Mistral-7B-Instruct-v0.3 --dtype float16 --port 8001

# AWQ 4-bit (HuggingFace에 이미 양자화된 모델 사용)
vllm serve TheBloke/Mistral-7B-Instruct-v0.2-AWQ --quantization awq --port 8002

# GPTQ 4-bit
vllm serve TheBloke/Mistral-7B-Instruct-v0.2-GPTQ --quantization gptq --port 8003
```

### VRAM 사용량 측정

```bash
nvidia-smi --query-gpu=memory.used,memory.free,memory.total --format=csv
# FP16:       13,824 MiB,  2,048 MiB, 16,384 MiB
# AWQ 4-bit:   4,096 MiB, 12,288 MiB, 16,384 MiB  ← KV Cache 여유 큼

curl http://localhost:8002/metrics | grep gpu_cache_usage
# vllm:gpu_cache_usage_perc 0.28   ← AWQ는 28%만 점유
```

### 직접 AWQ 양자화하기

```bash
pip install autoawq

python - <<'EOF'
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model_path = "mistralai/Mistral-7B-Instruct-v0.3"
save_path  = "./mistral-7b-awq-4bit"

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoAWQForCausalLM.from_pretrained(model_path)

quant_config = {
    "zero_point": True,
    "q_group_size": 128,
    "w_bit": 4,
    "version": "GEMM",
}

model.quantize(tokenizer, quant_config=quant_config)
model.save_quantized(save_path)
tokenizer.save_pretrained(save_path)
EOF
```

---

## 예상 결과

| 지표 | FP16 | AWQ 4-bit | GPTQ 4-bit |
|------|------|-----------|------------|
| VRAM | ~14GB | ~4GB | ~4.5GB |
| Tokens/sec | ~40 | ~38 | ~36 |
| P95 latency | 기준 | 유사 | 유사 |
| 품질 (perplexity) | 1.0x | ~1.02x | ~1.03x |
