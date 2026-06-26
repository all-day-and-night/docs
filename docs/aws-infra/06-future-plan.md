# 향후 계획 — Kubeflow + ML Pipeline

> ← [개요로 돌아가기](./00-overview)

---

## 목표

GitLab CI/CD + Kubeflow를 연동하여 **학습 → 평가 → 배포**가 자동화되는 ML Pipeline 구축

---

## 전체 파이프라인 흐름

```
코드 Push (GitLab)
    ↓
GitLab CI/CD (이미지 빌드 + 트리거)
    ↓
Kubeflow Pipelines
    ↓
데이터 전처리 Pod → 모델 학습 (PyTorchJob GPU) → 모델 평가 Pod
    ↓
모델 저장 (MLflow + S3)
    ↓
KServe Inference Service
    ↓
LLM API (OpenAI-compatible)
```

---

## 현재 → Kubeflow 전환 시 변경사항

| 항목 | 현재 | Kubeflow 추가 후 |
|------|------|-----------------|
| EKS 노드 | t3.medium x2 | t3.xlarge x3+ |
| GPU 노드 | 없음 | g4dn.xlarge 추가 (필수) |
| 스토리지 | EBS | **EFS 추가** (파이프라인 아티팩트) |
| LLM 서빙 | vLLM 직접 배포 | **KServe** 로 교체 |
| 실험 추적 | 없음 | **MLflow** 추가 |
| 월 비용 | ~$210 | ~$600~800 |

---

## 단계별 구현 순서

### Phase A — Kubeflow 설치

```bash
kubectl apply -k "github.com/kubeflow/manifests/..."
```

### Phase B — EFS 스토리지 추가

```hcl
# terraform/modules/efs/ 신규 모듈 추가
resource "aws_efs_file_system" "kubeflow" { ... }
```

### Phase C — GPU 노드그룹 추가

```hcl
# modules/eks/main.tf 에 추가
resource "aws_eks_node_group" "gpu" {
  instance_types = ["g4dn.xlarge"]
  capacity_type  = "ON_DEMAND"
}
```

### Phase D — MLflow + KServe 배포

- MLflow: Helm chart, S3를 artifact store로 사용
- KServe: vLLM/Ollama 대체

### Phase E — GitLab CI/CD 연동

```yaml
# .gitlab-ci.yml deploy 스테이지에 추가
trigger_kubeflow:
  stage: deploy
  script:
    - python scripts/trigger_pipeline.py --model $MODEL_NAME
```

---

## 관련 문서

- [전체 계획](../index)
- [EKS 클러스터 — GPU 노드그룹 추가 위치](./03-eks-cluster)
- [CI/CD 파이프라인 — 확장 방향](./05-cicd-pipeline)
