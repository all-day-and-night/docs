# GitLab CI 파이프라인 — ECR + GitOps 업데이트

> ← [HPA + Karpenter](./04-hpa-karpenter)

---

## 파이프라인 역할

서비스 레포(service-a, service-b)의 CI/CD가 담당하는 두 가지 작업:

1. **Docker 이미지 빌드 → ECR push**
2. **k8s-infra 레포의 `values-prod.yaml` 이미지 태그 업데이트**

두 번째 단계가 ArgoCD의 GitOps 트리거가 된다.

---

## 전체 흐름

```
서비스 레포 git push
    │
    ▼
GitLab CI (서비스 레포)
    ├── [build] Docker build → ECR push (태그: $CI_COMMIT_SHA)
    └── [update] k8s-infra 레포 values-prod.yaml 태그 업데이트 → git push
                    │
                    ▼
             k8s-infra 레포 (git commit)
                    │
                    ▼ (ArgoCD 자동 감지)
             EKS — Argo Rollouts Blue/Green 시작
```

---

## .gitlab-ci.yml 구조

```yaml
stages:
  - build
  - update

variables:
  AWS_REGION: "ap-northeast-2"
  ECR_REGISTRY: "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  ECR_REPO: "app-eks/service-a"
  IMAGE_TAG: $CI_COMMIT_SHA   # 커밋 해시를 이미지 태그로 사용

build:ecr:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - apk add --no-cache aws-cli
    - aws ecr get-login-password --region $AWS_REGION |
        docker login --username AWS --password-stdin $ECR_REGISTRY
  script:
    - docker build -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG .
    - docker push $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG
  only:
    - main

update:values:
  stage: update
  image: alpine:latest
  before_script:
    - apk add --no-cache git curl
    - git config --global user.email "ci@example.com"
    - git config --global user.name "GitLab CI"
  script:
    # k8s-infra 레포 클론
    - git clone https://oauth2:${K8S_INFRA_TOKEN}@gitlab.example.com/developer/k8s-infra.git
    - cd k8s-infra

    # values-prod.yaml의 이미지 태그 업데이트 (sed로 정확한 줄만 변경)
    - |
      sed -i "s|tag: \".*\"|tag: \"${IMAGE_TAG}\"|" helm/service-a/values-prod.yaml

    # 커밋 & 푸시
    - git add helm/service-a/values-prod.yaml
    - git commit -m "ci: update service-a image tag to ${IMAGE_TAG}"
    - git push origin main
  only:
    - main
  needs:
    - job: build:ecr   # ECR push 완료 후 실행
```

---

## GitLab CI/CD Variables 설정

**서비스 레포** (Settings → CI/CD → Variables):

| 변수명 | 설명 | Masked |
|--------|------|--------|
| `AWS_ACCESS_KEY_ID` | ECR push용 IAM 액세스 키 | ✅ |
| `AWS_SECRET_ACCESS_KEY` | ECR push용 IAM 시크릿 키 | ✅ |
| `AWS_ACCOUNT_ID` | AWS 계정 ID (ECR 레지스트리 URL 구성용) | |
| `K8S_INFRA_TOKEN` | k8s-infra 레포 쓰기 권한 GitLab PAT 또는 Deploy Token | ✅ |

---

## K8S_INFRA_TOKEN 발급

k8s-infra 레포에 대한 **쓰기 권한**이 필요하다.

**GitLab Personal Access Token (PAT):**
```
GitLab → 프로필 → Access Tokens
→ Scopes: write_repository
→ 토큰 복사 → 서비스 레포 CI/CD Variables에 K8S_INFRA_TOKEN으로 등록
```

**또는 Deploy Token (레포 범위):**
```
k8s-infra 레포 → Settings → Repository → Deploy tokens
→ read_repository + write_repository 체크
→ username/token을 서비스 레포 Variables에 등록
```

---

## ECR IAM 최소 권한

CI/CD에서 사용하는 IAM 사용자에게 ECR push에 필요한 권한만 부여한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:<region>:<account-id>:repository/app-eks/*"
    }
  ]
}
```

---

## 이미지 태그 전략

| 전략 | 예시 | 장단점 |
|------|------|--------|
| commit SHA | `abc1234f` | 추적 용이, 읽기 어려움 |
| `latest` | `latest` | 간단, ArgoCD 감지 불가 (동일 태그) |
| 시맨틱 버전 | `v1.2.3` | 명확, 릴리즈 관리 필요 |
| 날짜+SHA | `20260624-abc1234` | 가독성 + 추적성 |

::: warning latest 태그 사용 금지
`latest` 태그를 쓰면 values-prod.yaml을 업데이트해도 이미지 태그가 변경되지 않아 ArgoCD가 변경을 감지하지 못한다. 항상 고유한 태그를 사용해야 한다.
:::

---

## 배포 완료 확인

```bash
# ArgoCD에서 동기화 상태 확인
kubectl -n argocd get applications

# Rollout 상태 확인
kubectl argo rollouts get rollout service-a -n service-a

# Preview 파드 검증 후 promote
kubectl argo rollouts promote service-a -n service-a
```

---

## Shell Runner 설정 (WAF 환경)

### 배경

GitLab Runner가 Docker-in-Docker로 구성된 경우, CI 파이프라인 내부에서 `gitlab.example.com`으로 레포를 클론할 때 WAF(Web Application Firewall)에 의해 차단될 수 있다.

EKS 파드 → NAT Gateway → 외부 인터넷 경로로 나가는 IP가 WAF 허용 목록에 없으면 403/연결 거부가 발생한다.

**해결 방법:**

1. **WAF에 EKS NAT Gateway IP 추가** — 장기적으로 권장
2. **Shell Runner + `http://localhost` 클론 URL** — GitLab이 직접 설치된 EC2에서 실행 시 즉시 우회 가능

### Shell Runner 방식 `.gitlab-ci.yml`

```yaml
build:ecr:
  stage: build
  tags:
    - shell   # Shell Runner 지정
  before_script:
    - aws ecr get-login-password --region $AWS_REGION |
        docker login --username AWS --password-stdin $ECR_REGISTRY
  script:
    - docker build -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG .
    - docker push $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG

update:values:
  stage: update
  tags:
    - shell
  script:
    # localhost로 클론 (WAF 우회)
    - git clone http://localhost/developer/k8s-infra.git
    - cd k8s-infra
    - sed -i "s|tag: \".*\"|tag: \"${IMAGE_TAG}\"|" helm/service-a/values-dev.yaml
    - git add helm/service-a/values-dev.yaml
    - git commit -m "ci: update service-a develop to ${IMAGE_TAG} [skip ci]"
    - git push origin develop
```

::: tip [skip ci] 사용 이유
k8s-infra 레포에 push할 때 `[skip ci]`를 커밋 메시지에 포함하면 해당 커밋에서 CI가 다시 트리거되지 않는다. 무한 루프 방지에 필수다.
:::

---

## 트러블슈팅

### ECR 이미지가 없어서 파드가 `ImagePullBackOff`

**증상:** ArgoCD는 Synced 상태지만 파드가 `ImagePullBackOff`.

```bash
kubectl get pods -n service-b-dev
# NAME                           READY   STATUS             RESTARTS
# service-b-dev-c9f7b984-m4b96   0/1     ImagePullBackOff   0

kubectl describe pod -n service-b-dev <pod-name>
# Events: Back-off pulling image "...ecr.../service-b:latest"
```

**원인:** CI 파이프라인이 한 번도 성공하지 않아 ECR 레포지토리에 이미지가 없음.

```bash
# ECR 이미지 존재 여부 확인
aws ecr describe-images \
  --repository-name app-eks/service-b \
  --region ap-northeast-2
# imageDetails: []  ← 이미지 없음
```

**해결:**

1. GitLab → service-b 레포 → CI/CD → Pipelines → **Run pipeline** 수동 실행
2. 파이프라인 성공 후 ECR에 이미지가 push됨
3. ArgoCD가 자동으로 새 파드 생성 → Running

---

### CI가 k8s-infra 레포에 push 권한 없음 (403)

**증상:** `update:values` 단계에서 `git push` 실패.

**원인:** `K8S_INFRA_TOKEN` 변수가 설정되지 않았거나 토큰이 만료됨.

**해결:**
- GitLab PAT의 만료일 확인 (프로필 → Access Tokens)
- 만료된 경우 새 토큰 발급 후 서비스 레포 CI/CD Variables 업데이트
- 토큰은 반드시 `write_repository` 권한 포함
