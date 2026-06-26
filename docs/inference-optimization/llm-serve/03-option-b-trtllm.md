# Option B — TensorRT-LLM

latency/throughput 최적화가 필요할 때. 첫 실행 시 TRT 엔진 빌드로 시간이 걸림.

---

## 사전 준비 — NGC Secret

TRT-LLM 이미지는 `nvcr.io`(NVIDIA NGC) 인증이 필요.

```bash
kubectl create secret docker-registry ngc-secret \
  --docker-server=nvcr.io \
  --docker-username='$oauthtoken' \
  --docker-password=<NGC_API_KEY> \
  -n llm-serve
```

**Secret 저장 위치**: 클러스터 etcd (AWS 관리형). `llm-serve` 네임스페이스 범위.  
클러스터 삭제 시 함께 삭제 → 재생성 필요.

```bash
# 확인
kubectl get secret ngc-secret -n llm-serve
```

---

## 이미지 버전

| 태그 | 존재 여부 |
|------|---------|
| 0.17.0 ~ 0.19.0 | **NGC에 없음** |
| **0.20.0** | ✅ 사용 |
| 1.0.0, 1.1.0, 1.2.0 | ✅ 사용 가능 |

현재 사용: `nvcr.io/nvidia/tensorrt-llm/release:0.20.0`

---

## 배포

```bash
./scripts/20-deploy-trtllm.sh apply   # 배포 (20~30분, TRT 엔진 빌드 포함)
./scripts/20-deploy-trtllm.sh status
./scripts/20-deploy-trtllm.sh delete
```

---

## 핵심 설정

```yaml
# k8s/trtllm/deployment.yaml
spec:
  progressDeadlineSeconds: 1800   # 30분 — 이미지(30GB) pull + 엔진 빌드 포함
  template:
    spec:
      imagePullSecrets:
        - name: ngc-secret
      containers:
        - name: trtllm
          image: nvcr.io/nvidia/tensorrt-llm/release:0.20.0
          env:
            - name: LD_LIBRARY_PATH
              value: "/usr/local/tensorrt/targets/x86_64-linux-gnu/lib:/usr/local/tensorrt/lib:..."
          command: [trtllm-serve]
          args: [Qwen/Qwen2.5-7B-Instruct, --host, "0.0.0.0", --port, "8000", --tp_size, "2"]
```

---

## 실제 겪은 트러블슈팅

- `ImagePullBackOff`: 이미지 버전 0.17.0 미존재 → [트러블슈팅 모음](./07-troubleshooting) 참고
- `CrashLoopBackOff`: `libnvinfer.so.10` 경로 누락 (LD_LIBRARY_PATH)
- `ProgressDeadlineExceeded`: 기본 600s로는 부족
