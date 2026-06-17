# LG CNS 광고 최적화 플랫폼 (MOP) — AWS 인프라

::: info 프로젝트 개요
- **기간**: 2023.07 ~ 2024.02 (8개월)
- **역할**: AWS Cloud Engineer / Data Engineer
- **소속**: LG CNS
- **연관**: [MOP Agent (2026)](./12-mop-agent) — 동일 플랫폼의 후속 AI 고도화 프로젝트
:::

---

## 배경 및 목적

Amazon 광고 최적화 플랫폼(MOP)에서 ML 모델의 **학습 / 추론 파이프라인을 AWS 클라우드 기반으로 자동화**하는 것이 목적.  
기존 수작업 학습/배포를 Terraform 기반 IaC와 EKS Batch Job으로 전 과정 자동화했다.

---

## 아키텍처

```
[SQS 이벤트] → [Lambda 오케스트레이터]
                    ├→ SageMaker Training Job → S3 (모델 아티팩트)
                    └→ EKS Batch Job Pod (Dask 분산 추론)
                              ├← S3 (입력 데이터)
                              ├← S3 (모델)
                              └→ S3 (추론 결과)

Terraform → VPC / EKS / SageMaker / Lambda 인프라 관리
```

---

## 주요 구현

### 1. Terraform 기반 AWS 인프라 자동화

```hcl
resource "aws_eks_node_group" "ml_batch" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "ml-batch-nodegroup"
  instance_types  = ["c5.2xlarge"]

  scaling_config {
    desired_size = 2
    max_size     = 10
    min_size     = 0
  }

  tags = {
    "k8s.io/cluster-autoscaler/enabled" = "true"
  }
}
```

### 2. Pandas → Dask 전환 (대규모 데이터 처리)

```python
import dask.dataframe as dd

# 수백 GB 데이터를 메모리 초과 없이 처리
df = dd.read_parquet("s3://mop-data/users/", engine="pyarrow")
result = df.groupby("user_id").agg({"spend": "sum"}).compute()
```

### 3. SageMaker → EKS 역할 분리

- **학습**: SageMaker (관리형, 스케일링 자동)
- **추론 배치**: EKS Kubernetes Job (유연성, 비용 효율)

---

## 문제 해결 사례

| 문제 | 원인 | 해결 |
|------|------|------|
| 사용자 데이터 OOM | Pandas 단일 프로세스 메모리 한계 | Dask 분산 처리 + S3 Parquet 파티셔닝 → 메모리 80% 감소 |
| Batch Job 실패 시 재처리 누락 | 재시도 로직 없음 | K8s `backoffLimit` + SQS Dead Letter Queue → 자동 재처리 |
| 추론 시간 불규칙 | 노드 프로비저닝 콜드 스타트 | 최소 노드 유지 + Warm Pool → 시작 지연 90% 감소 |

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| 데이터 처리 | 단일 순차 | Dask 병렬 분산 |
| 메모리 사용 | OOM 빈발 | 안정적 |
| 파이프라인 | 수동 트리거 | SQS → Lambda → EKS 완전 자동화 |
| 인프라 관리 | 수동 콘솔 | Terraform IaC |

---

## 핵심 학습

- **Terraform 모듈 설계**: EKS, SageMaker, Lambda를 모듈로 분리해 환경별(dev/prod) 재사용
- **SageMaker vs EKS**: 학습은 SageMaker(관리형), 추론 배치는 EKS(유연성) 역할 분리
- **Dask**: Pandas API 호환 유지하면서 분산 처리 전환 가능 — 학습 곡선 낮음
- **K8s Job 패턴**: 배치 처리는 Deployment가 아닌 Job 리소스가 적합 (완료 보장)
