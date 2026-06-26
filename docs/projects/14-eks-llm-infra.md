# AWS EKS + LLM 인프라 실습

::: info 프로젝트 개요
- **기간**: 2026.06 ~ 진행중
- **목적**: vLLM 기반 LLM 서빙 + EKS 운영 역량 증명
- **현황**: [진행상황 상세보기](../progress)
:::

---

## 목표 아키텍처

```
클라이언트 (Webtoon AI Assistant)
    ↓
Route 53 (dex-playground.com)
    ↓
ALB (Application Load Balancer)
    ↓
Amazon EKS (gitlab-eks-dev)
    ├─ [ai-inference] FastAPI Backend (Deployment + HPA)
    ├─ [ai-inference] Redis (응답 캐시 / 세션)
    ├─ [ai-inference] vLLM Server (GPU Node, OpenAI-compatible API)
    └─ [monitoring] Prometheus + Grafana

GitLab EC2 (t3.large, 3.37.72.89)
    └─ GitLab Runner (Shell Executor)
        ├→ ECR (Docker 이미지)
        └→ kubectl apply → EKS
```

---

## 현재 인프라 상태

```
✅ S3 + DynamoDB     terraform state 백엔드
✅ VPC               10.0.0.0/16, 퍼블릭/프라이빗 서브넷 x2
✅ GitLab EC2         t3.large, EIP 3.37.72.89
✅ Route 53           gitlab.dex-playground.com → A 레코드
✅ SSL               Let's Encrypt, HTTPS 접속 완료
✅ GitLab Runner      Shell Executor, ec2-shell-runner 등록
⬜ EKS Cluster        미생성 (필요 시 apply)
⬜ vLLM 배포          EKS 이후
⬜ FastAPI 배포        EKS 이후
⬜ 모니터링 스택        EKS 이후
```

---

## vLLM on EKS — 핵심 개념

### PagedAttention (vLLM 핵심 기술)

```
기존 LLM 서빙의 메모리 낭비:
KV Cache 고정 크기 사전 할당 → 짧은 응답도 최대 길이만큼 메모리 점유
→ GPU 메모리 70% 이상 낭비

vLLM PagedAttention:
KV Cache 페이지 단위 동적 할당 → 실제 사용량만큼만 점유
→ GPU 메모리 효율 3~4배 향상 → 동시 처리 요청 수 대폭 증가
```

### Continuous Batching

```
기존 Static Batching:        vLLM Continuous Batching:
Request A: ████████           Request A: ████
Request B: ████████           Request B: ██████████
→ 짧은 A가 끝나도 B 완료 대기  → A 완료 즉시 새 요청 C 삽입
                              → Throughput 최대 23배 향상
```

### EKS GPU 노드 구성 (계획)

```yaml
# GPU 노드그룹 (g4dn.xlarge - NVIDIA T4)
managedNodeGroups:
  - name: gpu-nodegroup
    instanceType: g4dn.xlarge
    minSize: 0
    maxSize: 2
    labels:
      node-type: gpu
    taints:
      - key: nvidia.com/gpu
        value: "true"
        effect: NoSchedule
```

---

## 진행 단계별 계획

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | Terraform Bootstrap (S3, DynamoDB) | ✅ 완료 |
| 2 | VPC + 서브넷 + GitLab EC2 | ✅ 완료 |
| 3 | 도메인 + SSL (Route53 + Let's Encrypt) | ✅ 완료 |
| 4 | GitLab Runner 등록 | ✅ 완료 |
| 5 | EKS 클러스터 생성 | ⬜ 예정 |
| 6 | GitLab CI/CD 파이프라인 | ⬜ 예정 |
| 7 | FastAPI + Redis EKS 배포 | ⬜ 예정 |
| 8 | vLLM GPU 노드 배포 | ⬜ 예정 |
| 9 | Prometheus + Grafana 모니터링 | ⬜ 예정 |
| 10 | Locust 부하 테스트 + 성능 리포트 | ⬜ 예정 |

---

## 비용 현황

```
EKS OFF 상태: 월 ~$95  (EC2 t3.large + NAT Gateway)
EKS ON 상태:  월 ~$210 (+ EKS Control Plane + 노드)
GPU 추가 시:  월 ~$400+ (g4dn.xlarge SPOT 기준)
```

---

## 핵심 학습 목표

- **vLLM PagedAttention**: GPU 메모리 효율화 메커니즘 이해
- **EKS GPU 노드 운영**: NVIDIA 디바이스 플러그인, Taint/Toleration 설정
- **Continuous Batching**: Throughput 최적화 원리와 파라미터 튜닝
- **GitLab CI/CD → EKS**: 실제 ML 서비스 배포 파이프라인 경험
- **Prometheus/Grafana**: LLM 서빙 메트릭 (TPS, latency, GPU 사용률) 모니터링
