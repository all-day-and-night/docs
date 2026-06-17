# Option C — Triton Inference Server

다중 모델 운영, 표준 serving platform이 필요할 때.

---

## 이미지 선택

| 이미지 | TRT-LLM backend | 용도 |
|--------|----------------|------|
| `tritonserver:24.12-py3` (현재) | 없음 | ONNX / PyTorch / Python 모델 서빙 |
| `tritonserver:24.12-trtllm-python-py3` | 포함 | TRT-LLM 엔진 LLM 서빙 |

> TRT-LLM 엔진을 Triton으로 서빙하려면 `24.12-trtllm-python-py3`로 변경 필요.  
> NGC 인증 필요 → `ngc-secret` 추가.

---

## 배포

```bash
./scripts/30-deploy-triton.sh apply
./scripts/30-deploy-triton.sh status
./scripts/30-deploy-triton.sh delete
```

---

## 핵심 설정

```yaml
# k8s/triton/deployment.yaml
args:
  - --model-repository=/models
  - --http-port=8000
  - --grpc-port=8001
  - --metrics-port=8002
  - --model-control-mode=explicit   # 빈 model-repository로도 기동 가능
```

`--model-control-mode=explicit`: 시작 시 모델 자동 로드 안 함. API로 명시적 로드.  
기본값(`MODE_NONE`)은 빈 `/models` 디렉토리에서 exit → CrashLoopBackOff 발생.

---

## 모델 로드 방법

### 1. PVC에 파일 복사

```bash
kubectl cp ./my_model llm-serve/<triton-pod>:/models/my_model
```

### 2. API로 명시적 로드

```bash
# port-forward 후
kubectl port-forward -n llm-serve svc/triton-trtllm 8000:8000

curl -X POST http://localhost:8000/v2/repository/models/my_model/load
```

---

## model-repository 구조

```
/models/
  llama_trtllm/
    1/
      rank0.engine
      rank1.engine
    config.pbtxt
```

---

## API (KServe V2 프로토콜)

```bash
curl http://localhost:8000/v2/health/ready
curl http://localhost:8000/v2/models
curl -X POST http://localhost:8000/v2/repository/models/<name>/load
```

---

## PVC

```yaml
# k8s/triton/pvc.yaml
storageClassName: gp3   # EBS CSI Driver 필요 (03-install-addons.sh 선행)
resources:
  requests:
    storage: 200Gi
```

> ReadWriteOnce → 단일 Pod만 마운트 가능.  
> 여러 Triton Pod가 모델 공유 시 EFS(ReadWriteMany) 필요.
