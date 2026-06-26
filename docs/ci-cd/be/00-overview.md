# Backend EKS 배포 환경 구성 — 개요

> **목적:** GitLab CI/CD + ArgoCD GitOps로 컨테이너 애플리케이션을 EKS에 배포하고, Argo Rollouts으로 Blue/Green 무중단 배포를 구현

---

## 전체 아키텍처

```
[서비스 레포 (service-a / service-b)]
    │ 개발자 git push
    ▼
GitLab CI/CD
    ├── Docker build
    ├── ECR push (이미지 태그: $CI_COMMIT_SHA)
    └── k8s-infra 레포의 values-prod.yaml 이미지 태그 업데이트
                    │
                    │ (ArgoCD 자동 감지: 30초~3분)
                    ▼
               ArgoCD (App of Apps)
                    │
                    ▼
            EKS — Argo Rollouts
                    ├── Preview 파드 생성 (Green)
                    │   ← 검증 후 수동 promote
                    └── Active 서비스 트래픽 전환 (Blue → Green)
```

---

## 레포 구조 (GitOps 분리 원칙)

| 레포 | 역할 |
|------|------|
| `service-a`, `service-b` | 애플리케이션 소스 코드, Dockerfile, GitLab CI |
| `k8s-infra` (이 레포) | Terraform, Helm 차트, ArgoCD Application, Karpenter |

서비스 레포는 **"무엇을 배포할지"** (이미지 태그)만 업데이트하고,  
인프라 레포는 **"어떻게 배포할지"** (Rollout, HPA, Ingress 등)를 정의한다.

---

## 기술 스택

| 구성 요소 | 역할 |
|-----------|------|
| **Terraform** | EKS 클러스터, ECR, IAM, Karpenter, Helm 릴리즈 |
| **ArgoCD** | GitOps — Git 상태를 EKS에 지속 동기화 (App of Apps 패턴) |
| **Argo Rollouts** | Blue/Green 배포 전략 구현 |
| **Karpenter** | 파드 수요에 따라 노드 자동 프로비저닝/삭제 |
| **HPA** | CPU 기준 파드 자동 스케일링 |
| **AWS ALB Ingress** | 인터넷 → EKS 서비스 라우팅 |
| **ECR** | 컨테이너 이미지 저장소 |

---

## 디렉토리 구조

```
k8s-infra/
├── terraform/          # EKS, Karpenter, ArgoCD, Argo Rollouts Helm 설치
│   ├── eks.tf
│   ├── karpenter.tf
│   ├── helm-infra.tf   # ArgoCD, Argo Rollouts, LB Controller, metrics-server
│   ├── irsa.tf         # LB Controller IRSA
│   ├── ecr.tf          # ECR 레포 + 라이프사이클 정책
│   └── vpc.tf
├── helm/
│   ├── service-a/      # Spring Boot Helm 차트 (Rollout, HPA, Ingress)
│   └── service-b/      # FastAPI Helm 차트
├── argocd/
│   ├── root-app.yaml   # App of Apps 루트
│   └── apps/
│       ├── service-a.yaml
│       └── service-b.yaml
└── karpenter/
    ├── nodepool.yaml
    └── ec2nodeclass.yaml
```

---

## 배포 구성 순서 (최초 1회)

```
1. terraform apply        → EKS + Karpenter + ArgoCD + Argo Rollouts 설치
2. kubectl apply -f karpenter/  → NodePool, EC2NodeClass 등록
3. ArgoCD 접속 → k8s-infra 레포 등록
4. kubectl apply -f argocd/root-app.yaml  → App of Apps 시작
   → ArgoCD가 helm/service-a, helm/service-b 자동 배포
```

---

## 단계별 가이드

1. [Terraform — EKS 인프라 구성](./01-terraform)
2. [ArgoCD — GitOps & App of Apps](./02-argocd)
3. [Blue/Green 배포 — Argo Rollouts](./03-blue-green)
4. [HPA + Karpenter — 오토스케일링](./04-hpa-karpenter)
5. [GitLab CI 파이프라인 — ECR + GitOps 업데이트](./05-pipeline)
