# k8s 매니페스트 구성

## 파일 구조

```
kubernetes/
├── deployment.yaml   # 앱 4종 Deployment
├── service.yaml      # ClusterIP Service
├── hpa.yaml          # HorizontalPodAutoscaler
├── configmap.yaml    # 비민감 환경변수
└── secret.yaml       # 민감 환경변수 (API 키 등)
```

## Deployment

총 4개 Deployment로 구성.

| Deployment | 역할 | 로컬 replicas |
|------------|------|--------------|
| `agent-be` | FastAPI API 서버 | 1 |
| `agent-be-celery-worker` | Celery 태스크 처리 | 1 |
| `agent-be-kafka-worker` | Kafka 메시지 소비 | 1 |
| `agent-be-celery-beat` | Celery 스케줄러 | 1 |

> 프로덕션 기준 replicas: app 3, celery-worker 2, kafka-worker 2, beat 1 (beat는 항상 단일)

### 로컬에서 replicas를 줄인 이유
Rancher Desktop 단일 노드에 replicas 3+2+2 = 7개 Pod 띄우면 CPU `Insufficient` 로 Pending 발생.

### imagePullPolicy: Never
로컬 빌드 이미지를 registry 없이 사용하기 위해 필수.
```yaml
imagePullPolicy: Never
```
없으면 k8s가 registry에서 pull 시도 → ImagePullBackOff.

## Service

```yaml
type: ClusterIP  # 로컬은 port-forward로 접근
port: 80
targetPort: 8000
```

로컬 접근:
```bash
kubectl port-forward svc/agent-be 8000:80
```

## HPA (HorizontalPodAutoscaler)

```yaml
minReplicas: 1      # 로컬: 1 (원본: 2)
maxReplicas: 20
metrics:
  - CPU 70% 초과 시 스케일 업
  - Memory 80% 초과 시 스케일 업
scaleUp:
  stabilizationWindowSeconds: 60
  4 pods / 60s
scaleDown:
  stabilizationWindowSeconds: 300   # 섣불리 줄이지 않음
  2 pods / 120s
```

> HPA는 metrics-server 필요. Rancher Desktop k3s에 기본 포함.

## ConfigMap

비민감 환경변수 전체. `${NODE_IP}` 플레이스홀더를 배포 스크립트에서 `envsubst`로 치환.

```bash
NODE_IP=192.168.5.15 envsubst < kubernetes/configmap.yaml | kubectl apply -f -
```

핵심 값:
```yaml
REDIS_URL: "redis://${NODE_IP}:6379/0"
KAFKA_BOOTSTRAP_SERVERS: "${NODE_IP}:9092"
CELERY_BROKER_URL: "redis://${NODE_IP}:6379/2"
OLLAMA_BASE_URL: "http://192.168.5.2:11434"   # Mac host IP (Lima gateway)
```

## Secret

```yaml
kind: Secret
type: Opaque
stringData:
  OPENAI_API_KEY: "sk-..."
  AWS_ACCESS_KEY_ID: ""
  AWS_SECRET_ACCESS_KEY: ""
  EKS_LLM_API_KEY: "token"
```

`stringData`를 쓰면 base64 인코딩 없이 평문으로 입력 가능. kubectl이 저장 시 자동 인코딩.

> **주의**: secret.yaml은 절대 git commit 하지 않는다. `.gitignore`에 추가 필요.

## 관련 노트
- [개요 및 배포 전략](./00-overview)
- [Rancher Desktop 배포 가이드](./03-rancher-deploy)
