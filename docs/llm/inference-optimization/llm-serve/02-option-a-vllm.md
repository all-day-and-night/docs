# Option A — vLLM

가장 빠르게 PoC할 수 있는 선택. OpenAI 호환 API를 즉시 제공.

---

## 배포

```bash
./scripts/10-deploy-vllm.sh apply    # 배포 (5~15분)
./scripts/10-deploy-vllm.sh status   # 상태 + GPU 확인
./scripts/10-deploy-vllm.sh logs     # TP 초기화 로그 확인
./scripts/10-deploy-vllm.sh delete   # 삭제
```

---

## 핵심 설정

```yaml
# k8s/vllm/deployment.yaml
image: vllm/vllm-openai:latest
args:
  - Qwen/Qwen2.5-7B-Instruct
  - --tensor-parallel-size
  - "2"            # GPU 2개 Tensor Parallel
  - --gpu-memory-utilization
  - "0.90"
resources:
  limits:
    nvidia.com/gpu: 2
```

---

## API 테스트

```bash
# 터미널 1
./scripts/40-port-forward.sh vllm   # localhost:8000

# 터미널 2
./scripts/50-test-api.sh vllm
```

```bash
# 모델 목록
curl http://localhost:8000/v1/models | jq

# Chat Completions
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "messages": [{"role": "user", "content": "안녕하세요!"}],
    "max_tokens": 256
  }' | jq '.choices[0].message.content'
```

---

## GPU 사용 확인

```bash
kubectl exec -n llm-serve \
  $(kubectl get pod -n llm-serve -l app=vllm -o jsonpath='{.items[0].metadata.name}') \
  -- nvidia-smi
```

vLLM 로그에서 `Tensor parallel` 관련 초기화 메시지 확인:
```bash
kubectl logs deploy/vllm -n llm-serve -f
```
