# LMCache + Redis Remote Backend

## 개요

LMCache는 LLM inference 과정에서 생성되는 KV Cache를 재사용하기 위한 캐시 계층이다. vLLM과 함께 사용하면 반복되는 prompt prefix, RAG context, multi-turn conversation에서 prefill 중복 계산을 줄이고 TTFT를 개선할 수 있다.

Redis를 remote backend로 사용하면 vLLM 인스턴스가 생성한 KV Cache를 외부 저장소에 저장하고, 여러 vLLM replica가 동일한 Redis backend를 통해 cache를 공유할 수 있다.

```text
Client
  ↓
KServe Gateway / Ingress / Service
  ↓
vLLM OpenAI-compatible Server
  ↓
LMCache
  ↓
Redis Remote Backend
```

### 적용 대상

```text
- 동일한 system prompt가 반복되는 서비스
- RAG에서 같은 문서 context가 반복되는 경우
- multi-turn conversation workload
- vLLM replica가 2개 이상인 환경
```

### 사전 요구사항

```text
- Kubernetes cluster
- kubectl
- GPU node + NVIDIA device plugin
- Redis
- LMCache가 포함된 vLLM container image (lmcache/vllm-openai:latest)
- 선택: KServe
```

---

## 1. Namespace 생성

```bash
kubectl create namespace llm
```

---

## 2. Redis Remote Backend 배포

`redis.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lmcache-redis
  namespace: llm
spec:
  replicas: 1
  selector:
    matchLabels:
      app: lmcache-redis
  template:
    metadata:
      labels:
        app: lmcache-redis
    spec:
      containers:
        - name: redis
          image: redis:7
          args:
            - redis-server
            - --maxmemory
            - 3gb
            - --maxmemory-policy
            - allkeys-lru
          ports:
            - containerPort: 6379
          resources:
            requests:
              memory: 4Gi
            limits:
              memory: 4Gi
---
apiVersion: v1
kind: Service
metadata:
  name: lmcache-redis
  namespace: llm
spec:
  selector:
    app: lmcache-redis
  ports:
    - name: redis
      port: 6379
      targetPort: 6379
```

```bash
kubectl apply -f redis.yaml
kubectl get pods -n llm
kubectl exec -n llm deploy/lmcache-redis -- redis-cli PING
# PONG
```

---

## 3. LMCache ConfigMap 생성

`lmcache-config.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: lmcache-config
  namespace: llm
data:
  lmcache_config.yaml: |
    chunk_size: 256
    local_cpu: true
    remote_url: "redis://lmcache-redis.llm.svc.cluster.local:6379"
    remote_serde: "naive"
```

```bash
kubectl apply -f lmcache-config.yaml
```

| 항목 | 설명 |
|---|---|
| `chunk_size` | KV cache를 나누는 토큰 단위 |
| `local_cpu` | CPU memory를 local near-cache로 사용할지 여부 |
| `remote_url` | Redis remote backend 주소 |
| `remote_serde` | remote 저장소 직렬화 방식 (`naive` 권장) |

---

## 4. vLLM Deployment 예시 (KServe 없이 직접 배포)

`vllm-lmcache.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qwen-vllm-lmcache
  namespace: llm
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qwen-vllm-lmcache
  template:
    metadata:
      labels:
        app: qwen-vllm-lmcache
    spec:
      containers:
        - name: vllm
          image: lmcache/vllm-openai:latest
          args:
            - --model
            - Qwen/Qwen2.5-1.5B-Instruct
            - --served-model-name
            - qwen
            - --host
            - 0.0.0.0
            - --port
            - "8000"
            - --gpu-memory-utilization
            - "0.90"
            - --max-model-len
            - "4096"
            - --max-num-seqs
            - "16"
            - --enable-prefix-caching
            - --kv-transfer-config
            - '{"kv_connector":"LMCacheConnectorV1","kv_role":"kv_both"}'
          env:
            - name: LMCACHE_CONFIG_FILE
              value: /etc/lmcache/lmcache_config.yaml
          ports:
            - containerPort: 8000
          volumeMounts:
            - name: lmcache-config
              mountPath: /etc/lmcache
          resources:
            requests:
              cpu: "4"
              memory: 16Gi
              nvidia.com/gpu: "1"
            limits:
              cpu: "8"
              memory: 24Gi
              nvidia.com/gpu: "1"
      volumes:
        - name: lmcache-config
          configMap:
            name: lmcache-config
---
apiVersion: v1
kind: Service
metadata:
  name: qwen-vllm-lmcache
  namespace: llm
spec:
  selector:
    app: qwen-vllm-lmcache
  ports:
    - name: http
      port: 80
      targetPort: 8000
```

```bash
kubectl apply -f vllm-lmcache.yaml
kubectl get pods -n llm
kubectl logs -n llm deploy/qwen-vllm-lmcache -c vllm
kubectl exec -n llm deploy/qwen-vllm-lmcache -- printenv | grep LMCACHE
```

vLLM 주요 옵션:

| 옵션 | 설명 |
|---|---|
| `--enable-prefix-caching` | 반복 prompt prefix를 GPU 내에서 재사용 |
| `--kv-transfer-config` | LMCache connector 활성화 (vLLM V1 필수) |
| `--gpu-memory-utilization` | vLLM이 사용할 GPU memory 비율 (0.85~0.90 권장) |
| `--max-model-len` | 최대 context length |
| `--max-num-seqs` | 동시 처리 sequence 수 (초기 PoC: 8~16) |

---

## 5. KServe InferenceService 예시

`kserve-vllm-lmcache.yaml`

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: qwen-vllm-lmcache
  namespace: llm
spec:
  predictor:
    minReplicas: 1
    maxReplicas: 1
    containers:
      - name: kserve-container
        image: lmcache/vllm-openai:latest
        args:
          - --model
          - Qwen/Qwen2.5-1.5B-Instruct
          - --served-model-name
          - qwen
          - --host
          - 0.0.0.0
          - --port
          - "8000"
          - --gpu-memory-utilization
          - "0.90"
          - --max-model-len
          - "4096"
          - --max-num-seqs
          - "16"
          - --enable-prefix-caching
          - --kv-transfer-config
          - '{"kv_connector":"LMCacheConnectorV1","kv_role":"kv_both"}'
        env:
          - name: LMCACHE_CONFIG_FILE
            value: /etc/lmcache/lmcache_config.yaml
        ports:
          - containerPort: 8000
        volumeMounts:
          - name: lmcache-config
            mountPath: /etc/lmcache
        resources:
          requests:
            cpu: "4"
            memory: 16Gi
            nvidia.com/gpu: "1"
          limits:
            cpu: "8"
            memory: 24Gi
            nvidia.com/gpu: "1"
    volumes:
      - name: lmcache-config
        configMap:
          name: lmcache-config
```

```bash
kubectl apply -f kserve-vllm-lmcache.yaml
kubectl get inferenceservice -n llm
kubectl logs -n llm -l serving.kserve.io/inferenceservice=qwen-vllm-lmcache -c kserve-container
```

---

## 6. 동일 prefix 반복 호출 테스트

```bash
kubectl port-forward -n llm svc/qwen-vllm-lmcache 8080:80
```

동일 system prompt로 반복 호출해 TTFT 감소를 확인한다.

```bash
for i in $(seq 1 20); do
  curl -s http://localhost:8080/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen",
      "messages": [
        {
          "role": "system",
          "content": "You are an assistant for insurance claim document analysis. Use the same long policy guide and response format for every answer. This is a repeated prefix for cache testing."
        },
        {"role": "user", "content": "Summarize case '"$i"'."}
      ],
      "max_tokens": 128
    }' > /dev/null
done
```

비교를 위해 매번 다른 prompt도 호출한다.

```bash
for i in $(seq 1 20); do
  curl -s http://localhost:8080/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "model": "qwen",
      "messages": [{"role": "user", "content": "Write a random story about topic '"$RANDOM"'."}],
      "max_tokens": 128
    }' > /dev/null
done
```

기대 결과:

```text
- 동일 prefix workload: TTFT 감소
- 랜덤 prompt workload: cache 효과 미미
- Redis DBSIZE 증가 (KV cache 적재 확인)
- Redis memory 사용량 증가
```

---

## 7. Redis Cache 확인

```bash
kubectl exec -n llm deploy/lmcache-redis -- redis-cli DBSIZE
kubectl exec -n llm deploy/lmcache-redis -- redis-cli INFO memory
kubectl exec -n llm deploy/lmcache-redis -- redis-cli INFO clients
```

---

## 8. Replica 2개로 Cache 공유 테스트

Redis remote backend의 핵심 장점은 여러 vLLM replica가 동일한 cache를 공유한다는 점이다.

```bash
kubectl scale deployment qwen-vllm-lmcache -n llm --replicas=2
kubectl get pods -n llm -o wide
```

KServe 방식:

```bash
kubectl patch inferenceservice qwen-vllm-lmcache -n llm --type merge -p '{
  "spec": {"predictor": {"minReplicas": 2, "maxReplicas": 2}}
}'
```

replica 1에서 KV cache를 쌓은 뒤 replica 2가 동일 prefix 요청을 처리할 때 TTFT가 감소하면 cache 공유가 정상 동작하는 것이다.

---

## 9. 주요 측정 지표

| 지표 | 설명 | 기대 변화 |
|---|---|---|
| TTFT | Time To First Token | 반복 prefix에서 감소 |
| End-to-end latency | 전체 응답 시간 | 반복 prompt에서 감소 |
| Throughput | 초당 request/token 처리량 | cache hit 증가 시 향상 |
| GPU memory usage | GPU 메모리 사용량 | cache offloading 시 완화 |
| Redis memory usage | Redis 메모리 사용량 | cache 저장에 따라 증가 |
| Cache hit rate | cache 재사용률 | 높을수록 효과 큼 |
| p95/p99 latency | tail latency | 운영 안정성 확인 |

---

## 10. 운영 고려사항

**Redis Memory**

```text
--maxmemory 3gb
--maxmemory-policy allkeys-lru
```

운영에서는 ElastiCache Redis 같은 managed 서비스를 검토한다.

**Network Latency**

Remote backend는 network I/O가 추가된다. 동일 AZ 또는 동일 클러스터 내 Redis 배치가 중요하다. Redis Enterprise나 Valkey 같은 고성능 옵션도 검토할 수 있다.

**Security**

운영 환경에서는 다음 보안 설정을 적용한다.

```text
- Redis AUTH (비밀번호 인증)
- Redis TLS
- Kubernetes NetworkPolicy
- private subnet 배치
- 외부 공개 금지
```

Redis AUTH 적용 시 `remote_url` 형식:

```text
redis://:your_password@lmcache-redis.llm.svc.cluster.local:6379
```

---

## 11. 문제 해결

```bash
# LMCache 환경변수 및 설정 파일 확인
kubectl exec -n llm deploy/qwen-vllm-lmcache -- printenv | grep LMCACHE
kubectl exec -n llm deploy/qwen-vllm-lmcache -- cat /etc/lmcache/lmcache_config.yaml

# Redis key 생성 여부 확인
kubectl exec -n llm deploy/lmcache-redis -- redis-cli DBSIZE

# Redis 연결 테스트
kubectl exec -n llm deploy/qwen-vllm-lmcache -- sh -c \
  'nc -vz lmcache-redis.llm.svc.cluster.local 6379'

# vLLM 로그에서 LMCache 확인
kubectl logs -n llm deploy/qwen-vllm-lmcache -c vllm | grep -i lmcache

# Redis memory limit 확인
kubectl exec -n llm deploy/lmcache-redis -- redis-cli CONFIG GET maxmemory
kubectl exec -n llm deploy/lmcache-redis -- redis-cli CONFIG GET maxmemory-policy
```

GPU 메모리 부족 시 더 작은 모델로 대체한다.

```text
Qwen/Qwen2.5-1.5B-Instruct
TinyLlama/TinyLlama-1.1B-Chat-v1.0
HuggingFaceTB/SmolLM2-1.7B-Instruct
```

---

## 12. 권장 적용 순서

```text
1. vLLM 단독 실행
2. --enable-prefix-caching 적용
3. LMCache local_cpu 적용
4. Redis remote backend 적용
5. vLLM replica 2개로 확장
6. 동일 prefix workload로 TTFT 비교
7. Redis HA 또는 ElastiCache 검토
8. KServe InferenceService로 표준화
```

처음부터 multi-replica와 고가용성 Redis를 구성하지 말고 위 순서대로 단계적으로 검증한다.

---

## 결론

LMCache와 Redis remote backend를 함께 사용하면 vLLM의 KV Cache를 외부 Redis에 저장하고 반복되는 prefix나 RAG context를 재사용할 수 있다. replica가 2개 이상인 환경에서는 remote backend를 통한 cache 공유 효과를 기대할 수 있다.

다만 Redis remote backend는 network I/O를 추가하므로 모든 workload에서 성능이 향상되지는 않는다. 반드시 동일 prefix workload와 random prompt workload를 나누어 TTFT, end-to-end latency, throughput, Redis memory 사용량을 비교해야 한다.
