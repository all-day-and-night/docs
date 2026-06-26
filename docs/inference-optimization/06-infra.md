# 6단계 — 인프라 최적화: EKS 비용 구조 개선

---

## 문제: 소프트웨어 최적화만으로는 한계가 있다

```
비효율적인 구성:
  CPU 서비스(FastAPI, Redis) + GPU 서비스(vLLM)가 같은 노드에 혼재
  → GPU 노드 비용을 CPU 서비스가 낭비

트래픽 변동 무시:
  낮 시간 트래픽 100배 ↑ → 고정 GPU 노드 유지 중
  새벽 시간 트래픽 거의 없음 → 똑같이 GPU 노드 유지 중 → 비용 낭비
```

---

## 개선 1: CPU / GPU 노드 그룹 분리

CPU 워크로드와 GPU 워크로드를 별도 노드 그룹에 배치한다.

```
EKS Cluster
 ├─ CPU Node Group  (저비용 인스턴스, 예: c5.xlarge)
 │   ├─ FastAPI
 │   ├─ Redis
 │   ├─ VectorDB (pgvector 등)
 │   ├─ Prometheus
 │   └─ Grafana
 │
 └─ GPU Node Group  (고비용 인스턴스, 예: g4dn.xlarge)
     └─ vLLM
```

### Kubernetes 설정

GPU 노드에 taint를 걸어 GPU 워크로드만 스케줄링되도록 한다.

```bash
# GPU 노드에 taint 적용
kubectl taint nodes <gpu-node-name> nvidia.com/gpu=true:NoSchedule
kubectl label nodes <gpu-node-name> node-type=gpu
```

```yaml
# vLLM Deployment에 적용
spec:
  tolerations:
    - key: "nvidia.com/gpu"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"
  nodeSelector:
    node-type: gpu
  containers:
    - name: vllm
      resources:
        requests:
          nvidia.com/gpu: "1"
        limits:
          nvidia.com/gpu: "1"
```

---

## 개선 2: AutoScaling

### HPA — FastAPI Pod 자동 확장

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: fastapi-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: fastapi
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Karpenter — GPU Node 자동 확장

```yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: gpu-nodepool
spec:
  template:
    spec:
      requirements:
        - key: "node.kubernetes.io/instance-type"
          operator: In
          values: ["g4dn.xlarge", "g4dn.2xlarge"]
      taints:
        - key: nvidia.com/gpu
          value: "true"
          effect: NoSchedule
  limits:
    nvidia.com/gpu: 10   # 최대 GPU 10개
  disruption:
    consolidationPolicy: WhenEmpty  # Pod 없으면 노드 반환
```

### vLLM Queue 길이 기반 HPA

```
vLLM 대기 큐 길이 증가 (> 10)
 ↓
Prometheus Adapter가 custom metric으로 노출
 ↓
HPA가 vLLM Pod 복제 확장
 ↓
Karpenter가 GPU Node 추가
```

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vllm-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vllm
  minReplicas: 1
  maxReplicas: 4
  metrics:
    - type: Pods
      pods:
        metric:
          name: vllm_num_requests_waiting
        target:
          type: AverageValue
          averageValue: "5"   # 파드당 대기 요청 5개 초과 시 확장
```

---

## 개선 3: Spot 인스턴스 활용

| 워크로드 | 인스턴스 유형 | 이유 |
|---------|-------------|------|
| 실시간 추론 서버 (vLLM) | On-Demand | 중단 불가 |
| 모델 평가 배치 Job | Spot | 중단 후 재시작 가능 |
| 실험용 모델 실험 Job | Spot | 비용 우선 |
| 비동기 이미지 생성 | Spot 가능 | 큐 기반으로 내결함성 확보 가능 |

Spot 인스턴스는 On-Demand 대비 **70~90% 저렴**하다.  
언제든 회수될 수 있으므로 체크포인팅, 재시도 로직이 필요하다.

---

## 모니터링 구성

```
DCGM Exporter   → GPU Utilization, GPU Memory, GPU 온도 수집
Prometheus      → 전체 메트릭 수집 및 저장
Grafana         → 대시보드 시각화
```

### 핵심 대시보드 패널

| 패널 | 의미 |
|------|------|
| GPU Utilization (%) | 낮으면 과잉 프로비저닝 |
| GPU Memory Usage (GB) | 양자화 효과 확인 |
| vLLM Queue Length | 병목 감지 |
| P95 Latency (초) | SLA 모니터링 |
| Cost per 1K requests | 최적화 전후 비교 |
| Node Count (GPU) | Autoscaling 확인 |

```bash
# DCGM Exporter 설치
helm repo add gpu-helm-charts https://nvidia.github.io/dcgm-exporter/helm-charts
helm install dcgm-exporter gpu-helm-charts/dcgm-exporter --namespace monitoring

# GPU 메트릭 확인
curl http://localhost:9400/metrics | grep -E "DCGM_FI_DEV_GPU_UTIL|DCGM_FI_DEV_FB_USED"
# DCGM_FI_DEV_GPU_UTIL{gpu="0"}   87    ← GPU 사용률 87%
# DCGM_FI_DEV_FB_USED{gpu="0"}  4096   ← VRAM 4GB 사용 중
```

---

## 비용 계산 예시

### Before (최적화 전)

```
GPU 노드 (g4dn.2xlarge, $0.752/hr) × 3대 고정 운영
월간 비용: $0.752 × 3 × 24 × 30 = $1,623.36
```

### After (최적화 후)

```
On-Demand GPU (g4dn.xlarge, $0.526/hr) × 1대 최소 운영
낮 시간 Karpenter가 최대 3대까지 확장 (평균 1.5대)
Spot 배치 Job: g4dn.xlarge Spot ($0.158/hr)

월간 비용:
  On-Demand 평균 1.5대: $0.526 × 1.5 × 24 × 30 = $567.78
  Spot 배치 Job:        $0.158 × 5hr × 30 = $23.70
  합계: $591.48

비용 절감: $1,623.36 → $591.48 = 약 64% 절감
```

---

## 실험 설계

| 조건 | 구성 |
|------|------|
| A | 고정 GPU 노드 3대, CPU/GPU 혼합 배치 |
| B | CPU/GPU 분리, Karpenter AutoScaling, Spot 활용 |

측정 지표:
- GPU Utilization 평균 (%)
- 유휴 GPU 노드 시간 비율
- 월간 GPU 인스턴스 비용
- P95 latency (성능 회귀 없는지 확인)
- Scale-out / Scale-in 소요 시간
