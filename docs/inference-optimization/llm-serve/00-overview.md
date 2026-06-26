# llm-serve — EKS GPU LLM 서빙 실습

EKS GPU 환경에서 vLLM, TensorRT-LLM, Triton, Stable Diffusion을 서빙하는 실습 프로젝트.  

github url: https://github.com/all-day-and-night/llm-serve
---

## 아키텍처

```
Local PC
  │ kubectl port-forward 또는 LoadBalancer
  ▼
Kubernetes Service (llm-serve namespace)
  ├── Option A: vLLM              → /v1/chat/completions (OpenAI 호환)
  ├── Option B: TensorRT-LLM     → /v1/chat/completions (OpenAI 호환)
  ├── Option C: Triton            → /v2/* (KServe V2 프로토콜)
  └── Option D: Stable Diffusion  → /sdapi/v1/txt2img
  ▼
EKS GPU Node: g5.12xlarge
  - NVIDIA A10G × 4 (24GB × 4 = 96GB VRAM)
  - Driver 570.195.03 / CUDA 12.8
```

---

## 서빙 옵션 비교

| 옵션 | 프레임워크 | 모델 | GPU 병렬 | 용도 |
|------|-----------|------|---------|------|
| A | vLLM | Qwen2.5-7B-Instruct | TP=2 | LLM 빠른 PoC |
| B | TensorRT-LLM | Qwen2.5-7B-Instruct | tp_size=2 | LLM 성능 최적화 |
| C | Triton | 커스텀 엔진 | TRT-LLM backend TP=2 | 엔터프라이즈 serving |
| D | Stable Diffusion (A1111) | SDXL 1.0 | Replica (GPU 1개/Pod) | 이미지 생성 |

---

## 실습 순서

```
00-check-prereqs.sh    → 사전 도구 확인
01-create-cluster.sh   → EKS 클러스터 생성 (~20분)
02-create-nodegroup.sh → GPU NodeGroup 생성 (~10분)
03-install-addons.sh   → EBS CSI Driver + gp3 SC + NVIDIA Device Plugin
04-setup-common.sh     → namespace, HF token secret
05-gpu-test.sh         → nvidia-smi 확인

10-deploy-vllm.sh      → Option A
20-deploy-trtllm.sh    → Option B
30-deploy-triton.sh    → Option C
35-deploy-sd.sh        → Option D

40-port-forward.sh     → 로컬 접속
50-test-api.sh         → API 테스트
99-teardown.sh         → 전체 삭제
```

---

## 인프라 사양

| 항목 | 값 |
|------|----|
| EKS 버전 | 1.30 |
| 인스턴스 | g5.12xlarge |
| GPU | NVIDIA A10G × 4 (96GB VRAM) |
| 비용 | ~$16/hr on-demand |
| 리전 | ap-northeast-2 |
| 클러스터명 | ai-serving-gpu2-eks |
| 네임스페이스 | llm-serve |
