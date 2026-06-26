# HPA + Karpenter — 오토스케일링

> ← [Blue/Green 배포](./03-blue-green)

---

## 스케일링 레이어

```
트래픽 증가
    │
    ▼
HPA (Horizontal Pod Autoscaler)
  CPU 60% 초과 → 파드 수 증가
    │
    ▼  (기존 노드에 스케줄 불가)
Karpenter
  새 노드 자동 프로비저닝 (수십 초 내)
```

두 레이어가 독립적으로 동작하며 함께 트래픽 급증에 대응한다.

---

## HPA 구성

### HPA 매니페스트

```yaml
# helm/service-a/templates/hpa.yaml

apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: service-a-hpa
spec:
  scaleTargetRef:
    apiVersion: argoproj.io/v1alpha1
    kind: Rollout              # Deployment 대신 Rollout 대상
    name: service-a
  minReplicas: {{ .Values.hpa.minReplicas }}
  maxReplicas: {{ .Values.hpa.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.hpa.targetCPUUtilizationPercentage }}
```

::: warning Rollout + HPA 연동 주의
표준 Deployment가 아닌 Argo Rollouts의 `Rollout` 리소스를 대상으로 하므로, `scaleTargetRef.apiVersion`을 `argoproj.io/v1alpha1`로 지정해야 한다.
:::

### values-prod.yaml HPA 설정

```yaml
hpa:
  enabled: true
  minReplicas: 2               # 운영 환경 최소 2개 (고가용성)
  maxReplicas: 5
  targetCPUUtilizationPercentage: 60   # CPU 60% 초과 시 스케일 아웃
```

### metrics-server

HPA가 파드 CPU 사용률을 읽으려면 `metrics-server`가 필요하다. Terraform의 `helm-infra.tf`에서 자동으로 설치된다.

```bash
# 메트릭 확인
kubectl top pods -n service-a
kubectl get hpa -n service-a
```

---

## Karpenter 구성

### 전체 구조

```
NodePool (karpenter/nodepool.yaml)
  └── 사용 가능한 인스턴스 타입, 용량 타입, 리소스 상한 정의

EC2NodeClass (karpenter/ec2nodeclass.yaml)
  └── AMI, 서브넷, 보안 그룹, 디스크 설정
```

### NodePool

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]      # Spot 우선, 없으면 ON_DEMAND
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["t3.medium", "t3.large", "t3.xlarge"]
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default

  limits:
    cpu: "20"        # 클러스터 전체 Karpenter 노드 최대 CPU
    memory: "40Gi"

  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s   # 30초 동안 비어있거나 낭비되면 노드 제거
```

| 항목 | 설명 |
|------|------|
| `spot + on-demand` | Spot을 우선 사용해 비용 절감, 재고 없으면 ON_DEMAND 사용 |
| `limits` | 과도한 스케일 아웃 방지 (비용 상한) |
| `consolidationPolicy` | 사용률 낮은 노드를 통합해 불필요한 노드 제거 |
| `consolidateAfter: 30s` | 빠른 통합으로 유휴 노드 비용 최소화 |

### EC2NodeClass

```yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  role: "KarpenterNodeRole-<cluster-name>"   # terraform output 값으로 교체

  amiFamily: AL2023    # Amazon Linux 2023

  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: "<cluster-name>"   # EKS 클러스터 태그로 서브넷 자동 탐색

  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: "<cluster-name>"

  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 30Gi
        volumeType: gp3
        deleteOnTermination: true
        encrypted: true
```

::: tip role 값 확인
`role` 필드는 Terraform 적용 후 확인한다:
```bash
terraform output karpenter_node_role_name
```
:::

### Karpenter IAM (karpenter.tf 핵심)

| IAM 리소스 | 설명 |
|-----------|------|
| `KarpenterNodeRole` | Karpenter가 프로비저닝한 EC2 노드 IAM 역할 |
| `KarpenterControllerRole` | Karpenter 컨트롤러 IRSA 역할 (EC2 생성/삭제 권한) |
| SQS Queue | Spot 인터럽션 이벤트 수신 |
| EventBridge Rules | EC2 Spot 인터럽션, 상태 변경 이벤트를 SQS로 라우팅 |

Karpenter는 Spot 인터럽션 이벤트를 SQS → EventBridge로 수신해 워크로드를 미리 다른 노드로 이동시킨다.

---

## Karpenter 리소스 적용

```bash
# EC2NodeClass의 role 필드를 terraform output 값으로 수정 후 적용
kubectl apply -f karpenter/
```

### 스케일업 테스트

```bash
# 리소스 많이 요청하는 파드 5개 생성 → 새 노드 자동 추가 확인
kubectl create deployment inflate \
  --image=public.ecr.aws/eks-distro/kubernetes/pause:3.7 \
  --replicas=5

# 노드 추가 확인 (수십 초 내)
kubectl get nodes -w

# Karpenter 로그 확인
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter -f

# 정리
kubectl delete deployment inflate
```

---

## 다음 단계

- [GitLab CI 파이프라인 →](./05-pipeline)

---

## 트러블슈팅

### EC2NodeClass `amiFamily` 필드 오류 (Karpenter v1 API 변경)

**증상:** `kubectl apply -f karpenter/` 후 EC2NodeClass가 적용되지 않거나 노드가 프로비저닝되지 않음.

**원인:** Karpenter v1(GA) API에서 `amiFamily` 필드가 제거되고 `amiSelectorTerms`로 대체됨.

```yaml
# ❌ 이전 방식 (v1beta1 또는 일부 v1 초기 버전)
spec:
  amiFamily: AL2023

# ✅ Karpenter v1 방식
spec:
  amiSelectorTerms:
    - alias: al2023@latest   # 항상 최신 AL2023 AMI 사용
```

---

### 노드가 클러스터에 조인하지 못하는 문제

**증상:** Karpenter가 EC2 인스턴스는 생성하지만 `kubectl get nodes`에 노드가 나타나지 않거나 `NotReady` 상태가 지속됨.

**원인:** Karpenter 프로비저닝 노드에 클러스터 보안 그룹이 적용되지 않아 노드가 EKS 컨트롤 플레인과 통신하지 못함.

`securityGroupSelectorTerms`에 `karpenter.sh/discovery` 태그만 지정하면 클러스터 보안 그룹이 누락될 수 있다. EKS가 클러스터 생성 시 자동으로 만드는 보안 그룹(`aws:eks:cluster-name` 태그)을 함께 지정해야 한다.

```yaml
# ❌ 클러스터 SG 누락
securityGroupSelectorTerms:
  - tags:
      karpenter.sh/discovery: "<cluster-name>"

# ✅ 클러스터 SG 포함
securityGroupSelectorTerms:
  - tags:
      karpenter.sh/discovery: "<cluster-name>"
  - tags:
      aws:eks:cluster-name: "<cluster-name>"   # EKS 클러스터 보안 그룹
```

**확인 방법:**

```bash
# Karpenter 컨트롤러 로그에서 SG 선택 결과 확인
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter -f

# 해당 클러스터의 보안 그룹 태그 확인
aws ec2 describe-security-groups \
  --filters "Name=tag:aws:eks:cluster-name,Values=<cluster-name>" \
  --query 'SecurityGroups[*].[GroupId,GroupName]' \
  --output table
```

**최종 EC2NodeClass 예시:**

```yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  role: "KarpenterNodeRole-<cluster-name>"

  amiSelectorTerms:
    - alias: al2023@latest

  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: "<cluster-name>"

  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: "<cluster-name>"
    - tags:
        aws:eks:cluster-name: "<cluster-name>"

  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 30Gi
        volumeType: gp3
        deleteOnTermination: true
        encrypted: true
```
