# ArgoCD — GitOps & App of Apps

> ← [Terraform 인프라 구성](./01-terraform)

---

## GitOps 원칙

ArgoCD는 Git 레포를 **단일 진실의 원천(Single Source of Truth)**으로 삼아 클러스터 상태를 지속적으로 동기화한다.

```
Git 레포 (k8s-infra)
  helm/service-a/values-prod.yaml  ←── 개발자가 이미지 태그 업데이트
        │
        │ ArgoCD가 30초~3분 간격으로 감지
        ▼
  EKS 클러스터
  (현재 상태 ≠ Git 상태 → 자동 동기화)
```

`selfHeal: true` — 누군가 직접 `kubectl edit`으로 클러스터를 수정해도 ArgoCD가 Git 상태로 되돌린다.  
`prune: true` — Git에서 삭제된 리소스는 클러스터에서도 자동 삭제된다.

---

## App of Apps 패턴

하나의 루트 Application이 나머지 Application들을 관리하는 계층 구조다.

```
argocd/
├── root-app.yaml       # 루트: argocd/apps/ 폴더를 감시
└── apps/
    ├── service-a.yaml  # service-a 배포 정의
    ├── service-a-dev.yaml
    ├── service-b.yaml
    └── service-b-dev.yaml
```

새 서비스를 추가하려면 `argocd/apps/`에 Application YAML 파일을 추가하기만 하면 된다. ArgoCD가 자동으로 감지해 배포한다.

---

## root-app.yaml

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root-app
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io  # 삭제 시 하위 앱도 함께 삭제
spec:
  project: default
  source:
    repoURL: https://gitlab.example.com/developer/k8s-infra.git
    targetRevision: HEAD
    path: argocd/apps        # 이 폴더 안의 모든 Application 파일을 관리
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## service Application (apps/service-a.yaml)

dev와 prod를 별도 Application으로 분리하고, 각각 다른 브랜치와 values 파일을 바라보게 한다.

```yaml
# apps/service-a-dev.yaml — dev 환경
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: service-a-dev
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://gitlab.example.com/developer/k8s-infra.git
    targetRevision: develop        # develop 브랜치를 바라봄
    path: helm/service-a
    helm:
      valueFiles:
        - values-dev.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: service-a-dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

```yaml
# apps/service-a.yaml — prod 환경
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: service-a-prod
  namespace: argocd
spec:
  source:
    targetRevision: main           # main 브랜치를 바라봄
    path: helm/service-a
    helm:
      valueFiles:
        - values-prod.yaml
  destination:
    namespace: service-a
```

| Application | 브랜치 | values 파일 | 네임스페이스 |
|-------------|--------|------------|------------|
| service-a-dev | `develop` | `values-dev.yaml` | `service-a-dev` |
| service-a-prod | `main` | `values-prod.yaml` | `service-a` |

---

## ArgoCD 초기 접속 절차

```bash
# 1. 초기 admin 비밀번호 확인
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo

# 2. 포트 포워딩
kubectl port-forward svc/argo-cd-argocd-server -n argocd 8080:443

# 3. 브라우저에서 https://localhost:8080 접속
#    id: admin / pw: 위에서 확인한 값
```

---

## 레포 등록 (GitLab Deploy Token)

ArgoCD가 GitLab의 k8s-infra 레포를 읽으려면 인증이 필요하다.

```bash
# GitLab → Settings → Repository → Deploy tokens에서 생성
# read_repository 권한만 필요

# ArgoCD CLI로 레포 등록
argocd repo add https://gitlab.example.com/developer/k8s-infra.git \
  --username <deploy-token-username> \
  --password <deploy-token-value>
```

또는 ArgoCD UI → Settings → Repositories → Connect Repo에서 등록한다.

---

## root-app 적용

```bash
# 레포 등록 완료 후
kubectl apply -f argocd/root-app.yaml

# 동기화 상태 확인
kubectl -n argocd get applications
```

root-app이 생성되면 `argocd/apps/` 폴더의 모든 Application을 자동으로 생성하고 동기화한다.

---

## 동기화 상태 확인

```
Synced    — Git 상태 = 클러스터 상태
OutOfSync — Git 변경이 감지되었으나 아직 적용 전
Degraded  — 리소스가 정상 상태가 아님 (파드 CrashLoop, ImagePullBackOff 등)
Unknown   — 상태를 판단할 수 없음 (리소스 미존재 또는 CRD 미지원)
```

::: tip ArgoCD Argo Rollouts 연동
Argo Rollouts의 Rollout 리소스는 ArgoCD가 `Healthy` 상태를 판단할 때 Rollout 상태를 참조한다.  
Blue/Green에서 promote 대기 중인 경우 ArgoCD UI에서 `Suspended` 또는 `Progressing` 으로 표시된다.
:::

---

## 트러블슈팅

### Application Health가 `Degraded`인데 Sync는 `Synced`

**의미:** ArgoCD가 Git 상태를 클러스터에 적용하는 데는 성공했지만(`Synced`), 파드 자체가 정상 동작하지 않음(`Degraded`).

**주요 원인:**
- 파드 `ImagePullBackOff` — ECR에 이미지가 없거나 pull 권한 없음
- 파드 `CrashLoopBackOff` — 애플리케이션 실행 오류
- `Pending` — 노드 리소스 부족 (Karpenter가 노드를 프로비저닝 중이거나 실패)

```bash
# 파드 상태 확인
kubectl get pods -n service-a-dev

# 파드 이벤트 확인
kubectl describe pod <pod-name> -n service-a-dev | tail -20
```

---

### `Unknown` Health Status

**의미:** ArgoCD가 해당 리소스의 상태를 판단하는 방법을 모름. CRD 기반 리소스(Rollout 등)는 ArgoCD에 health check 로직이 등록되어야 한다.

Argo Rollouts를 설치하면 ArgoCD가 Rollout 리소스 상태를 자동으로 인식한다. `Unknown`이 지속된다면 Argo Rollouts 컨트롤러가 정상 실행 중인지 확인한다.

```bash
kubectl get pods -n argo-rollouts
```

---

## 다음 단계

- [Blue/Green 배포 →](./03-blue-green)
