# Terraform — EKS 인프라 구성

> ← [개요로 돌아가기](./00-overview)

---

## 파일 구조

```
terraform/
├── main.tf         # Provider 설정 (AWS, Helm, Kubernetes)
├── vpc.tf          # VPC, Subnet, IGW, NAT Gateway
├── eks.tf          # EKS 클러스터, 시스템 노드 그룹
├── karpenter.tf    # Karpenter IAM, SQS, EventBridge, Helm 릴리즈
├── helm-infra.tf   # ArgoCD, Argo Rollouts, LB Controller, metrics-server
├── irsa.tf         # LB Controller IRSA
├── ecr.tf          # ECR 레포 생성 + 라이프사이클 정책
├── outputs.tf
├── variables.tf
└── backend.tf      # S3 + DynamoDB 상태 저장
```

---

## Provider 설정

```hcl
terraform {
  required_providers {
    aws        = { source = "hashicorp/aws",        version = "~> 5.0" }
    helm       = { source = "hashicorp/helm",       version = "~> 2.0" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.0" }
    http       = { source = "hashicorp/http",       version = "~> 3.0" }
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    token                  = data.aws_eks_cluster_auth.this.token
  }
}
```

`helm` / `kubernetes` 프로바이더가 EKS 클러스터 생성 후 바로 리소스를 배포할 수 있도록 EKS 엔드포인트와 인증 토큰을 직접 참조한다.

---

## EKS 클러스터 (eks.tf)

```hcl
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  cluster_endpoint_public_access  = true   # 외부 kubectl 접근
  cluster_endpoint_private_access = true

  enable_irsa = true   # OIDC Provider 생성 (IRSA 필수)

  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
  }

  # 시스템 전용 노드 그룹 (Karpenter, CoreDNS 등 운영 파드)
  eks_managed_node_groups = {
    system = {
      instance_types = ["t3.medium"]
      capacity_type  = "ON_DEMAND"    # 시스템 파드는 안정적인 노드에
      desired_size   = 1

      taints = [{
        key    = "CriticalAddonsOnly"
        value  = "true"
        effect = "NO_SCHEDULE"        # 앱 파드 배치 방지
      }]
    }
  }

  node_security_group_tags = {
    "karpenter.sh/discovery" = var.cluster_name   # Karpenter 서브넷 탐색용
  }
}
```

### 노드 그룹 분리 전략

| 노드 그룹 | 용도 | 타입 |
|-----------|------|------|
| `system` (Managed) | Karpenter, CoreDNS, ArgoCD 등 운영 파드 | ON_DEMAND |
| Karpenter 노드 | 애플리케이션 파드 (service-a, service-b) | Spot + ON_DEMAND 혼합 |

시스템 노드에 `CriticalAddonsOnly` taint를 걸어 앱 파드가 배치되지 않게 하고, 앱 파드는 Karpenter가 동적으로 프로비저닝한 노드에서 실행된다.

---

## ECR 레포 (ecr.tf)

```hcl
locals {
  ecr_repos = ["app-eks/service-a", "app-eks/service-b"]
}

resource "aws_ecr_repository" "apps" {
  for_each             = toset(local.ecr_repos)
  name                 = each.value
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true   # push 시 자동 취약점 스캔
  }
}

resource "aws_ecr_lifecycle_policy" "apps" {
  for_each   = aws_ecr_repository.apps
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "최근 10개 이미지만 유지"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}
```

라이프사이클 정책으로 이미지를 최근 10개만 유지해 ECR 스토리지 비용을 제어한다.

---

## Helm 릴리즈 (helm-infra.tf)

Terraform이 EKS 생성 직후 필요한 구성 요소를 Helm으로 자동 설치한다.

| Helm 릴리즈 | 네임스페이스 | 역할 |
|-------------|-------------|------|
| `aws-load-balancer-controller` | kube-system | Ingress → ALB 프로비저닝 |
| `metrics-server` | kube-system | HPA CPU 메트릭 수집 |
| `argo-cd` (v7.7.23) | argocd | GitOps 컨트롤러 |
| `argo-rollouts` | argo-rollouts | Blue/Green 배포 컨트롤러 |

### LB Controller IRSA (irsa.tf)

```hcl
# OIDC 기반으로 특정 ServiceAccount에만 IAM 권한 부여
data "aws_iam_policy_document" "aws_lb_controller_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${...}:sub"
      values   = ["system:serviceaccount:kube-system:aws-load-balancer-controller"]
    }
  }
}
```

IRSA(IAM Roles for Service Accounts)로 LB Controller ServiceAccount에만 ALB 생성 권한을 부여한다. EC2 인스턴스에 광범위한 권한을 주지 않아도 된다.

---

## 적용 명령

```bash
cd terraform

# 초기화 (provider 다운로드)
terraform init

# 변경 사항 미리 보기
terraform plan

# 적용 (~15분 소요: EKS + Karpenter + Helm 릴리즈 포함)
terraform apply
```

::: tip kubeconfig 설정
terraform apply 완료 후:
```bash
aws eks update-kubeconfig --name <cluster-name> --region ap-northeast-2
kubectl get nodes
```
:::

---

## 다음 단계

- [ArgoCD 설정 →](./02-argocd)
