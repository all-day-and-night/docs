# Blue/Green 배포 — Argo Rollouts

> ← [ArgoCD GitOps](./02-argocd)

---

## Blue/Green 개념

```
                    ┌─────────────────────────────────┐
인터넷 트래픽        │           EKS                   │
     │              │                                  │
     ▼              │  Active Service ──→ [Blue 파드]  │  ← 현재 운영 버전
  ALB Ingress       │                                  │
     │              │  Preview Service ──→ [Green 파드]│  ← 새 버전 (검증 중)
     │              │                                  │
     └──────────────┘
```

- **Blue (Active)**: 현재 사용자 트래픽을 받는 버전
- **Green (Preview)**: 새 버전. 트래픽 없이 검증 가능
- **Promote**: 검증 완료 후 Active ↔ Preview 서비스 전환

기존 Deployment의 Rolling Update와 달리, 두 버전이 **동시에** 실행되므로 전환 전 충분히 테스트할 수 있다.

---

## Rollout CRD 구조

```yaml
# helm/service-a/templates/rollout.yaml

apiVersion: argoproj.io/v1alpha1
kind: Rollout                    # Deployment를 대체하는 Argo Rollouts CRD
metadata:
  name: service-a
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels: ...
  template:
    spec:
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          readinessProbe:
            httpGet:
              path: {{ .Values.healthPath }}
              port: {{ .Values.containerPort }}
            initialDelaySeconds: 15
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: {{ .Values.healthPath }}
            initialDelaySeconds: 30
            periodSeconds: 15

  strategy:
    blueGreen:
      activeService: service-a-active        # 운영 트래픽
      previewService: service-a-preview      # 테스트 트래픽
      autoPromotionEnabled: false            # 수동 승인 필요
      scaleDownDelaySeconds: 30              # promote 후 Blue 파드 유지 시간
```

---

## Service 쌍 구성

Blue/Green을 위해 두 개의 Service가 필요하다.

```yaml
# service-active.yaml — 운영 트래픽
apiVersion: v1
kind: Service
metadata:
  name: service-a-active
spec:
  selector:
    app: service-a
  ports:
    - port: 80
      targetPort: 8080
```

```yaml
# service-preview.yaml — 검증용
apiVersion: v1
kind: Service
metadata:
  name: service-a-preview
spec:
  selector:
    app: service-a
  ports:
    - port: 80
      targetPort: 8080
```

Argo Rollouts가 배포 과정에서 각 Service의 selector를 Blue 또는 Green 파드로 자동으로 변경한다.

---

## 배포 흐름

### 1단계: 이미지 태그 업데이트

GitLab CI가 `values-prod.yaml`의 이미지 태그를 업데이트한다.

```
image:
  tag: "abc1234"  ← commit SHA로 교체
```

### 2단계: ArgoCD 감지 → Rollout 업데이트

ArgoCD가 변경을 감지하고 Rollout에 새 이미지 태그를 적용한다.

### 3단계: Preview(Green) 파드 생성

```
[Blue 파드: v1] ← Active Service (트래픽 유지)
[Green 파드: v2] ← Preview Service (트래픽 없음, 검증용)
```

### 4단계: Preview 검증

```bash
# Preview 서비스로 포트 포워딩
kubectl port-forward svc/service-a-preview 8080:80 -n service-a

# 헬스 체크
curl http://localhost:8080/actuator/health

# 기능 테스트 등 검증
```

### 5단계: Promote (Blue → Green 전환)

**방법 1: ArgoCD UI (kubectl 플러그인 없을 때 권장)**

1. ArgoCD 접속 → **Apps → service-a-dev** 클릭
2. 리소스 목록에서 `Rollout` 리소스 클릭
3. 상단 **PROMOTE** 버튼 클릭

**방법 2: kubectl argo rollouts 플러그인**

```bash
kubectl argo rollouts promote service-a -n service-a
```

**방법 3: kubectl patch (플러그인 미설치 환경)**

```bash
kubectl patch rollout service-a-dev -n service-a-dev \
  --type merge \
  -p '{"status":{"pauseConditions":null}}'
```

promote 즉시 Active Service의 selector가 Green 파드로 변경된다.  
이후 `scaleDownDelaySeconds: 30` 경과 후 이전 Blue 파드가 제거된다.

---

## values 파일 구조

```yaml
# values.yaml (기본값)
blueGreen:
  autoPromotionEnabled: false   # 수동 promote 기본값
  scaleDownDelaySeconds: 30

# values-prod.yaml (운영 환경 오버라이드)
replicaCount: 2
image:
  tag: "latest"                 # CI/CD가 commit SHA로 업데이트
hpa:
  enabled: true
ingress:
  enabled: true
```

### dev/prod 환경 분리

dev 환경은 검증 부담 없이 빠른 배포가 목적이므로 `autoPromotionEnabled: true`를 권장한다.  
prod 환경은 반드시 수동으로 Preview를 검증한 후 promote한다.

```yaml
# values-dev.yaml — dev는 자동 promote
blueGreen:
  autoPromotionEnabled: true   # Preview Ready → 즉시 Active 전환
```

```yaml
# values-prod.yaml — prod는 수동 promote 유지
# (values.yaml의 autoPromotionEnabled: false를 상속)
```

---

## Rollout 상태 확인

```bash
# 현재 Rollout 상태 확인
kubectl argo rollouts get rollout service-a -n service-a

# 실시간 모니터링
kubectl argo rollouts get rollout service-a -n service-a --watch
```

출력 예시:
```
Name:            service-a
Namespace:       service-a
Status:          ॐ  Paused
Strategy:        BlueGreen
  Active:        service-a-active
  Preview:       service-a-preview
  Images:        ...amazonaws.com/app-eks/service-a:abc1234 (preview)
                 ...amazonaws.com/app-eks/service-a:old-sha  (active)
```

---

## 롤백

```bash
# 이전 버전으로 롤백
kubectl argo rollouts undo service-a -n service-a
```

또는 `values-prod.yaml`의 이미지 태그를 이전 commit SHA로 되돌리고 push하면 ArgoCD가 자동으로 롤백을 적용한다.

---

## 트러블슈팅

### ArgoCD에서 `Suspended` 상태로 표시됨

**증상:** `kubectl get applications -n argocd`에서 Health Status가 `Suspended`.

**원인:** 정상 동작이다. `autoPromotionEnabled: false`일 때 Preview 파드가 Ready 상태가 되면 Rollout이 promote를 기다리며 일시 정지(Paused) 상태가 된다. ArgoCD는 이를 `Suspended`로 표시한다.

promote 후 Active 전환이 완료되면 `Healthy`로 돌아온다.

---

### `kubectl argo rollouts` 명령어 실행 안 됨

**증상:** `error: unknown command "argo" for "kubectl"`

**원인:** `kubectl argo rollouts` 플러그인이 설치되지 않음.

**해결:** 플러그인 없이 ArgoCD UI나 `kubectl patch`로 promote한다. (위 5단계 방법 1, 3 참고)

---

## 다음 단계

- [HPA + Karpenter →](./04-hpa-karpenter)
