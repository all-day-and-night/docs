# EKS 클러스터

> ← [개요로 돌아가기](./00-overview)

---

## 구성

| 항목 | 값 |
|------|-----|
| Kubernetes 버전 | 1.29 |
| 노드 타입 | t3.medium |
| 용량 타입 | **SPOT** (비용 ~70% 절감) |
| 노드 수 | desired 2 / min 1 / max 4 |
| 서브넷 | Private Subnet x2 |

### 노드 역할

```
EKS Worker Node (t3.medium SPOT)
├── K8s 시스템 컴포넌트 (CoreDNS, kube-proxy, aws-node)
└── 향후 LLM Service Pod (vLLM / Ollama)
```

---

## EKS 온오프 방법

::: warning
GitLab EC2는 EKS와 무관하게 항상 유지됨
:::

```bash
# 시작 (약 15~20분 소요)
./scripts/03-eks-up.sh

# 종료 (비용 절감)
./scripts/04-eks-down.sh
```

### 시작 후 kubeconfig 설정

```bash
aws eks update-kubeconfig --region ap-northeast-2 --name gitlab-eks-dev
kubectl get nodes
```

---

## Terraform 구조

```
terraform/
├── modules/eks/         ← EKS 클러스터, 노드그룹, IAM, OIDC
└── envs/dev/eks/        ← 온오프 분리 환경
    ├── main.tf           ← persistent의 VPC를 remote_state로 참조
    ├── variables.tf
    └── terraform.tfvars
```

### Remote State 연결 방식

```hcl
# eks/main.tf
data "terraform_remote_state" "persistent" {
  backend = "s3"
  config = {
    bucket = "gitlab-eks-terraform-state-151564769076"
    key    = "dev/persistent/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

# VPC ID를 persistent state에서 가져옴
vpc_id = data.terraform_remote_state.persistent.outputs.vpc_id
```

---

## 비용

| 항목 | 비용/시간 |
|------|----------|
| EKS Control Plane | ~$0.10 |
| t3.medium SPOT x2 | ~$0.015 |
| **합계** | **~$0.115/시간** |

> 하루 8시간 사용 시 월 ~$28 추가

---

## 향후 GPU 노드그룹 추가 계획

LLM 서빙 준비 시 `modules/eks/main.tf`에 GPU 노드그룹 추가:

```hcl
resource "aws_eks_node_group" "gpu" {
  instance_types = ["g4dn.xlarge"]
  capacity_type  = "ON_DEMAND"
  # ...
}
```

→ [Kubeflow + ML Pipeline 계획](./06-future-plan)
