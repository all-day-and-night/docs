# EKS 인프라 구성

[프로젝트 개요](./00-overview) 프로젝트의 인프라 세팅 기록.

---

## 1. EKS 클러스터 생성

`eks/cluster/cluster.yaml` 기반으로 생성. OIDC 활성화(IRSA 지원).

```bash
./scripts/01-create-cluster.sh
# → eksctl create cluster -f eks/cluster/cluster.yaml
```

kubeconfig 업데이트:
```bash
aws eks update-kubeconfig --region ap-northeast-2 --name ai-serving-gpu2-eks
```

---

## 2. GPU NodeGroup 생성

```bash
./scripts/02-create-nodegroup.sh
# → eksctl create nodegroup -f eks/nodegroup/gpu-nodegroup.yaml
```

| 항목 | 값 |
|------|----|
| 인스턴스 | g5.12xlarge |
| GPU | A10G × 4 |
| 볼륨 | 300GB gp3 |
| 레이블 | `gpu-node=true`, `accelerator=nvidia` |

```bash
# 확인
kubectl get nodes -L accelerator,gpu-node
```

> g5.xlarge는 GPU 1개라 TP=2 Pod 불가. GPU 2개 이상 필요한 경우 g5.12xlarge 이상 선택.

---

## 3. EBS CSI Driver + gp3 StorageClass

```bash
./scripts/03-install-addons.sh
```

**EKS 1.22+ 주의사항**: in-tree AWS EBS provisioner(`kubernetes.io/aws-ebs`)가 제거됨.  
PVC 프로비저닝을 위해 EBS CSI Driver addon이 반드시 필요.

```bash
# EBS CSI Driver 설치
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster ai-serving-gpu2-eks \
  --region ap-northeast-2 \
  --force

# gp3 StorageClass 생성 (기본 SC로 설정)
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  fsType: ext4
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF
```

```bash
# 확인
kubectl get storageclass
```

---

## 4. NVIDIA Device Plugin

```bash
helm repo add nvdp https://nvidia.github.io/k8s-device-plugin
helm upgrade --install nvdp nvdp/nvidia-device-plugin \
  --namespace nvidia-device-plugin --create-namespace \
  -f helm/nvidia-device-plugin-values.yaml --wait
```

설치 후 `nvidia.com/gpu` 리소스가 노드에 노출됨.

```bash
# 검증: GPU 4개 노출 여부
kubectl describe node -l gpu-node=true | grep -A8 "Capacity:"
```

---

## 5. 공통 리소스

```bash
./scripts/04-setup-common.sh
```

- `llm-serve` namespace 생성
- HuggingFace token secret 생성 (`hf-token`)

```bash
# Gated 모델(Llama 등) 사용 시
export HF_TOKEN=hf_xxxxxxxxxx
./scripts/04-setup-common.sh
```

---

## 6. GPU 동작 확인

```bash
./scripts/05-gpu-test.sh
# nvidia/cuda 이미지로 nvidia-smi 실행, A10G 4개 인식 여부 확인
```

---

## 7. KServe 설치 (Option E 전제)

```bash
./scripts/06-install-kserve.sh
```

- cert-manager v1.15.3 설치 (KServe webhook TLS)
- KServe v0.13.0 CRD + Controller 설치
- RawDeployment 모드 설정 (Knative 불필요)
- `llm-serve` 네임스페이스 KServe 활성화 레이블 추가

---

## 8. 정리 (비용 절감)

```bash
./scripts/99-teardown.sh nodegroup  # GPU 노드그룹만 삭제 (비용 차단)
./scripts/99-teardown.sh all        # 전체 삭제 (확인 프롬프트 있음)
```

> `--disable-eviction` 옵션 포함: DaemonSet Pod(kube-proxy, aws-node 등)는  
> evict 불가능하므로 drain을 건너뛰고 바로 삭제.
