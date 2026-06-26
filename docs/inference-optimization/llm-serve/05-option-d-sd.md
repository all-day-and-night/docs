# Option D — Stable Diffusion (AUTOMATIC1111)

텍스트 → 이미지 생성. ai-dock 이미지 기반으로 A1111 API 서버 구동.

---

## 배포

```bash
./scripts/35-deploy-sd.sh apply     # 배포 (모델 다운 포함 5~10분)
./scripts/35-deploy-sd.sh status
./scripts/35-deploy-sd.sh scale 2   # GPU 2개 활용 (replica 확장)
./scripts/35-deploy-sd.sh delete
```

---

## ai-dock 이미지 특이사항

이미지: `ghcr.io/ai-dock/stable-diffusion-webui:latest`

| 항목 | 값 | 비고 |
|------|-----|------|
| 내부 API 포트 | **17860** | ai-dock 기본값 (7860 아님!) |
| Service 포트 | 7860 → 17860 | targetPort: 17860 |
| 기본 플래그 | `--no-half` 자동 추가 | 이미지 내부에서 삽입 |

---

## 핵심 설정

```yaml
# k8s/stable-diffusion/deployment.yaml
initContainers:
  - name: fix-permissions
    image: busybox
    command: ["sh", "-c", "mkdir -p /models/Stable-diffusion /models/VAE /models/Lora && chmod -R 777 /models"]
    # EBS 볼륨은 root 소유로 마운트됨 → non-root 컨테이너 권한 오류 방지

containers:
  - name: stable-diffusion
    ports:
      - containerPort: 17860   # ai-dock 기본 포트
    env:
      - name: WEBUI_FLAGS
        value: "--api --nowebui --xformers --opt-sdp-attention --precision half"
        # --no-half-vae 제거: ai-dock의 기본 --no-half와 충돌
    readinessProbe:
      httpGet:
        port: 17860
    livenessProbe:
      httpGet:
        port: 17860
```

```yaml
# k8s/stable-diffusion/service.yaml
ports:
  - port: 7860
    targetPort: 17860   # 외부 7860 → 컨테이너 17860
```

---

## API 테스트

```bash
# port-forward (Service가 7860으로 노출)
./scripts/40-port-forward.sh sd   # localhost:7860

# 이미지 생성
curl -X POST http://localhost:7860/sdapi/v1/txt2img \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a futuristic GPU server in space, cinematic",
    "negative_prompt": "blurry, low quality",
    "steps": 20,
    "sampler_name": "DPM++ 2M Karras",
    "width": 1024,
    "height": 1024,
    "cfg_scale": 7,
    "seed": 42
  }' | jq -r '.images[0]' | base64 -d > output.png
```

---

## 최적화 요약

| 기법 | 효과 |
|------|------|
| xFormers + Flash Attention | 10~40% 속도 향상 |
| DPM++ 2M Karras (20 steps) | DDIM 50 steps 대비 2.5x |
| LCM-LoRA (4~8 steps) | 8~12x 향상 |
| FP16 (`--precision half`) | VRAM 50% 절감 |
| Replica 2개 (GPU 1개/Pod) | Throughput 2x |

---

## 실제 겪은 트러블슈팅

- 포트 7860 vs 17860 불일치로 빈 이미지 반환 → [트러블슈팅 모음](./07-troubleshooting) 참고
- `--no-half-vae` + `--precision half` 충돌 (AssertionError)
- EBS 볼륨 root 소유로 마운트 → PermissionError
