# AWS 인프라 구축 개요

> **목적:** AI Inference Platform AWS EKS 환경 구성
> GitLab CI/CD → EKS 배포 파이프라인을 직접 구축하여 운영 역량 확보

---

## 최종 아키텍처

```
개발자 로컬
    ↓ git push
GitLab EC2 (t3.large / 3.37.72.89)
    ↓
GitLab Runner (Shell Executor)
    ↓ kubectl / helm
EKS Cluster (t3.medium SPOT x2)
    ↓
LLM Service (vLLM / Ollama)
    ↕ (향후 추가)
GPU NodeGroup (g4dn.xlarge)
```

---

## 핵심 설계 결정

| 결정 | 이유 |
|------|------|
| GitLab → EC2 (Omnibus) | EKS에 올리면 비용↑, stateful 워크로드에 EC2가 적합 |
| Runner → EC2에 설치 | EKS가 꺼져 있어도 CI/CD 동작, kubectl로 EKS에 명령 전달 |
| EKS → 온오프 분리 | 학습 환경에서 비용 절감 (~$95 vs ~$210/월) |
| Terraform 환경 분리 | `persistent/` (상시) + `eks/` (온오프) |

---

## 진행 현황

- [x] **Bootstrap** — S3 + DynamoDB 생성 완료
- [x] **Persistent** — VPC + GitLab EC2 생성 완료 (`3.37.72.89`)
- [ ] GitLab 초기 설정 (설치 진행 중)
- [ ] EKS 생성
- [ ] Runner 등록
- [ ] CI/CD 파이프라인 검증
- [ ] Kubeflow + ML Pipeline (예정)

---

## 비용 요약

| 상태 | 월 비용 |
|------|--------|
| GitLab EC2만 (EKS OFF) | ~$95 |
| EKS 포함 (ON) | ~$210 |
| GPU 노드 추가 시 | ~$590 |

::: tip 비용 절감 팁
EKS 노드그룹을 **SPOT 인스턴스**로 설정 → 일반 대비 ~70% 절감

실습 후에는 `./scripts/04-eks-down.sh` 로 EKS 종료
:::

---

## 프로젝트 경로

```
~/Project/practice/gitlab/
├── scripts/        # 실행 스크립트 (00~06)
├── terraform/      # IaC 코드
├── helm/           # Helm values
└── .gitlab-ci.yml  # CI/CD 파이프라인
```

---

## 단계별 가이드

1. [사전 준비 & Bootstrap](./01-bootstrap)
2. [VPC + GitLab EC2](./02-vpc-gitlab)
3. [EKS 클러스터](./03-eks-cluster)
4. [GitLab Runner 설정](./04-gitlab-runner)
5. [CI/CD 파이프라인](./05-cicd-pipeline)
6. [향후 계획 (Kubeflow)](./06-future-plan)
7. [트러블슈팅](./troubleshooting)
