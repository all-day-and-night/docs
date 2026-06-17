# 트러블슈팅 모음

실습 중 실제로 겪은 오류와 해결 기록.

---

## 1. EKS 1.30 — PVC Pending (gp3 StorageClass 없음)

**현상**: `PVC Pending`, `FailedScheduling`

**원인**: EKS 1.22부터 in-tree AWS EBS provisioner(`kubernetes.io/aws-ebs`) 제거됨.  
`gp3` StorageClass가 존재하지 않음.

**해결**:
```bash
# EBS CSI Driver addon 설치
eksctl create addon --name aws-ebs-csi-driver --cluster <cluster> --region ap-northeast-2 --force

# gp3 StorageClass 생성
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

`03-install-addons.sh`에 반영됨.

---

## 2. TRT-LLM — ImagePullBackOff (이미지 버전 없음)

**현상**: `ImagePullBackOff`

**원인**: `nvcr.io/nvidia/tensorrt-llm/release:0.17.0` 태그가 NGC에 존재하지 않음.  
사용 가능한 최소 버전: `0.20.0`

**해결**: `deployment.yaml` 이미지 태그를 `0.20.0`으로 변경.

```yaml
image: nvcr.io/nvidia/tensorrt-llm/release:0.20.0
```

사용 가능 태그: `0.20.0`, `1.0.0`, `1.1.0`, `1.2.0`

---

## 3. TRT-LLM — ImagePullBackOff (ngc-secret 없음)

**현상**: `ImagePullBackOff` — `nvcr.io` 인증 실패

**원인**: NGC 레지스트리 접근 시 docker-registry secret 필요.

**해결**:
```bash
kubectl create secret docker-registry ngc-secret \
  --docker-server=nvcr.io \
  --docker-username='$oauthtoken' \
  --docker-password=<NGC_API_KEY> \
  -n llm-serve
```

`deployment.yaml`에 `imagePullSecrets` 추가:
```yaml
spec:
  imagePullSecrets:
    - name: ngc-secret
```

---

## 4. TRT-LLM — CrashLoopBackOff (libnvinfer.so.10 없음)

**현상**: `CrashLoopBackOff`
```
error while loading shared libraries: libnvinfer.so.10: cannot open shared object file
```

**원인**: TRT 라이브러리 실제 경로(`/usr/local/tensorrt/targets/x86_64-linux-gnu/lib/`)가  
`LD_LIBRARY_PATH`에 포함되지 않음.

**디버깅**:
```bash
kubectl run debug --image=nvcr.io/nvidia/tensorrt-llm/release:0.20.0 \
  --rm -it --restart=Never -- find /usr/local/tensorrt -name "libnvinfer.so*"
# → /usr/local/tensorrt/targets/x86_64-linux-gnu/lib/libnvinfer.so.10
```

**해결**: `deployment.yaml` env에 경로 추가:
```yaml
env:
  - name: LD_LIBRARY_PATH
    value: "/usr/local/tensorrt/targets/x86_64-linux-gnu/lib:/usr/local/tensorrt/lib:..."
```

---

## 5. TRT-LLM — ProgressDeadlineExceeded

**현상**: `Deployment exceeded its progress deadline`

**원인**: 기본 `progressDeadlineSeconds: 600`(10분)으로는 이미지 pull(30GB, ~10분) + TRT 엔진 빌드 시간이 부족.

**해결**:
```yaml
spec:
  progressDeadlineSeconds: 1800   # 30분
```

---

## 6. Triton — CrashLoopBackOff (빈 model-repository)

**현상**: `CrashLoopBackOff` — Triton 바로 종료

**원인**: 기본 모드(`MODE_NONE`)는 시작 시 model-repository를 스캔하고 모델이 없으면 exit.  
PVC가 비어있는 상태에서 기동 불가.

**해결**:
```yaml
args:
  - --model-control-mode=explicit   # 빈 repo에서도 기동, 모델은 API로 명시적 로드
```

---

## 7. Stable Diffusion — 빈 이미지 반환 (포트 불일치)

**현상**: API 호출 성공하지만 빈 이미지 반환 또는 연결 실패.

**원인**: ai-dock 이미지는 API 포트로 **17860**을 사용함 (7860 아님).  
컨테이너 포트, probe, service targetPort가 모두 7860으로 잘못 설정됨.

**해결**:
```yaml
# deployment.yaml
ports:
  - containerPort: 17860
readinessProbe:
  httpGet:
    port: 17860
livenessProbe:
  httpGet:
    port: 17860

# service.yaml
ports:
  - port: 7860
    targetPort: 17860   # 외부 7860 → 컨테이너 17860
```

---

## 8. Stable Diffusion — AssertionError (--no-half-vae 충돌)

**현상**: 컨테이너 시작 즉시 crash
```
AssertionError: --no-half and --no-half-vae conflict with --precision half
```

**원인**: ai-dock 이미지가 내부적으로 `--no-half`를 기본 플래그로 추가함.  
`WEBUI_FLAGS`에 `--no-half-vae`를 추가하면 충돌 발생.

**해결**: `WEBUI_FLAGS`에서 `--no-half-vae` 제거.
```yaml
env:
  - name: WEBUI_FLAGS
    value: "--api --nowebui --xformers --opt-sdp-attention --precision half"
```

---

## 9. Stable Diffusion — EBS 권한 오류 (PermissionError)

**현상**: Pod 시작 후 `/models` 디렉토리 생성 실패.

**원인**: 새로 프로비저닝된 EBS 볼륨은 `root:root` 소유로 마운트됨.  
non-root 컨테이너는 디렉토리 생성/쓰기 불가.

**해결**: initContainer로 권한 수정:
```yaml
initContainers:
  - name: fix-permissions
    image: busybox
    command:
      - sh
      - -c
      - |
        mkdir -p /models/Stable-diffusion /models/VAE /models/Lora \
                  /models/hypernetworks /models/ControlNet /models/ESRGAN
        chmod -R 777 /models
    volumeMounts:
      - name: sd-models
        mountPath: /models
```

---

## 10. NodeGroup 삭제 — unevictable pods 무한 대기

**현상**: `eksctl delete nodegroup` 후 아래 메시지가 계속 반복됨.
```
3 pods are unevictable from node ...
```

**원인**: DaemonSet Pod(`kube-proxy`, `aws-node`, `nvidia-device-plugin`)는 evict 불가.  
drain이 완료되지 않아 삭제 진행 안 됨.

**해결**: `--disable-eviction` 플래그로 drain 건너뜀.
```bash
eksctl delete nodegroup \
  -f eks/nodegroup/gpu-nodegroup.yaml \
  --approve \
  --disable-eviction
```

`99-teardown.sh`에 반영됨.

---

## 11. KServe — ClusterServingRuntime CRD 없음

**현상**:
```
no matches for kind "ClusterServingRuntime" in version "serving.kserve.io/v1alpha1"
```

**원인**: `06-install-kserve.sh`를 실행하지 않아 KServe CRD가 설치되지 않음.

**해결**: `60-deploy-kserve-vllm.sh` 실행 전 반드시 선행:
```bash
./scripts/06-install-kserve.sh   # cert-manager + KServe CRD 설치
```
