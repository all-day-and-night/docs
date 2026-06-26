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
학습 데이터 적재 이후, SQS + Lambda 기반의 **이벤트 드리븐 우선순위 큐 아키텍처**를 도입하여 작업 유형(학습/추론)별 자원 우선 할당을 구현했다.  
분산 환경(Lambda, SageMaker, EKS)에서 발생하는 동시성 문제는 Redis 분산락으로 제어했다.

---

## 아키텍처

```
[학습 데이터 적재 완료]
        │
        ▼
[SQS 우선순위 큐]
  ├─ High Priority Queue  (학습 Job)
  ├─ Medium Priority Queue (추론 배치)
  └─ Low Priority Queue   (데이터 전처리)
        │
        ▼
[Lambda 오케스트레이터]
  ├─ 우선순위 기반 자원 할당 결정
  ├─ Redis 분산락 획득 → 동시 실행 충돌 방지
  ├→ SageMaker Training Job → S3 (모델 아티팩트)
  └→ EKS Batch Job Pod (Dask 분산 추론)
            ├← S3 (입력 데이터 / 모델)
            └→ S3 (추론 결과)

Terraform → VPC / EKS / SageMaker / Lambda / ElastiCache(Redis) 인프라 관리
```

---

## 주요 구현

### 1. SQS 우선순위 큐 기반 이벤트 드리븐 아키텍처

작업 유형별로 SQS 큐를 분리하고, Lambda에서 높은 우선순위 큐를 먼저 폴링하는 방식으로 자원 선점 순서를 보장했다.

```python
QUEUE_PRIORITY = [
    os.environ["HIGH_PRIORITY_QUEUE_URL"],    # 학습 Job
    os.environ["MEDIUM_PRIORITY_QUEUE_URL"],  # 추론 배치
    os.environ["LOW_PRIORITY_QUEUE_URL"],     # 전처리
]

def poll_by_priority(sqs_client):
    for queue_url in QUEUE_PRIORITY:
        response = sqs_client.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=1,
        )
        messages = response.get("Messages", [])
        if messages:
            return queue_url, messages[0]
    return None, None
```

Lambda는 EventBridge 스케줄로 주기적으로 호출되며, 우선순위 순으로 큐를 순회해 메시지가 있는 경우 즉시 자원을 할당하고 처리한다.

### 2. Redis 분산락 — 동시성 제어

Lambda 다중 인스턴스, SageMaker Job, EKS Pod가 동시에 동일 자원(GPU 슬롯, S3 경로)을 점유하려는 Race Condition 상황에서 Redis SET NX 기반 분산락으로 단일 진입을 보장했다.

```python
import redis
import uuid

redis_client = redis.Redis(host=os.environ["REDIS_HOST"], port=6379, decode_responses=True)

def acquire_lock(resource_key: str, ttl_seconds: int = 300) -> str | None:
    lock_id = str(uuid.uuid4())
    acquired = redis_client.set(resource_key, lock_id, nx=True, ex=ttl_seconds)
    return lock_id if acquired else None

def release_lock(resource_key: str, lock_id: str):
    current = redis_client.get(resource_key)
    if current == lock_id:
        redis_client.delete(resource_key)

def dispatch_job(job_type: str, payload: dict):
    lock_key = f"lock:resource:{job_type}"
    lock_id = acquire_lock(lock_key)
    if not lock_id:
        # 이미 다른 인스턴스가 자원 점유 중 → 메시지 visibility timeout 내 재시도
        return False
    try:
        _run_job(job_type, payload)
    finally:
        release_lock(lock_key, lock_id)
    return True
```

TTL을 설정해 Lambda 비정상 종료 시에도 락이 영구 점유되지 않도록 했다.

### 3. Terraform 기반 AWS 인프라 자동화

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

### 4. Pandas → Dask 전환 (대규모 데이터 처리)

```python
import dask.dataframe as dd

df = dd.read_parquet("s3://mop-data/users/", engine="pyarrow")
result = df.groupby("user_id").agg({"spend": "sum"}).compute()
```

---

## 문제 해결 사례

| 문제 | 원인 | 해결 |
|------|------|------|
| 학습/추론 작업 간 자원 경합 | 단일 큐에서 선입선출 처리 → 긴 배치가 학습 블로킹 | SQS 우선순위 큐 분리 + Lambda 폴링 순서 제어 → 학습 Job 우선 자원 확보 |
| 분산 환경 Race Condition | Lambda 다중 인스턴스가 동시에 동일 GPU 슬롯 점유 시도 | Redis SET NX 분산락 + TTL → 단일 진입 보장, 데드락 방지 |
| 사용자 데이터 OOM | Pandas 단일 프로세스 메모리 한계 | Dask 분산 처리 + S3 Parquet 파티셔닝 → 메모리 80% 감소 |
| Batch Job 실패 시 재처리 누락 | 재시도 로직 없음 | K8s `backoffLimit` + SQS Dead Letter Queue → 자동 재처리 |

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 |
|------|--------|--------|
| 작업 스케줄링 | 단일 FIFO 큐, 수동 우선순위 조정 | SQS 우선순위 큐 → 학습 Job 자원 선점 보장 |
| 동시성 제어 | 없음 (Race Condition 발생) | Redis 분산락 → 단일 자원 진입 보장 |
| 데이터 처리 | 단일 순차, OOM 빈발 | Dask 병렬 분산, 안정적 |
| 파이프라인 | 수동 트리거 | 이벤트 드리븐 완전 자동화 |
| 인프라 관리 | 수동 콘솔 | Terraform IaC |

---

## 핵심 학습

- **SQS 우선순위 큐 패턴**: 큐를 분리하고 Lambda 폴링 순서로 우선순위를 구현 — SQS 자체는 우선순위를 지원하지 않으므로 클라이언트 측 폴링 전략이 핵심
- **Redis 분산락**: SET NX + TTL 조합으로 멱등성과 데드락 방지를 동시에 달성 — 분산 환경에서 낙관적 락보다 단순하고 확실한 방법
- **이벤트 드리븐 설계**: 데이터 적재 이벤트 → SQS → Lambda 흐름으로 파이프라인 전 단계를 비동기·자동화
- **Dask**: Pandas API 호환 유지하면서 분산 처리 전환 가능 — 학습 곡선 낮음
- **K8s Job 패턴**: 배치 처리는 Deployment가 아닌 Job 리소스가 적합 (완료 보장)
