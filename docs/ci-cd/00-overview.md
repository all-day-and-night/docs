# CI/CD 배포 환경 구성

> 각 레이어별로 배포 전략과 파이프라인 구성을 정리한 섹션입니다.

---

## 섹션 구성

| 섹션 | 내용 | 상태 |
|------|------|------|
| **infra** | GitLab 서버, Runner, Terraform IaC 구성 | 예정 |
| **fe** | Frontend 정적 웹 배포 (S3 + CloudFront) | ✅ 작성 완료 |
| **be** | Backend EKS 배포 — Blue/Green, ArgoCD, HPA, Karpenter | 예정 |

---

## 전체 배포 흐름 (개요)

```
개발자
  │ git push
  ▼
GitLab CI/CD
  ├─ [fe] build → S3 sync → CloudFront 무효화
  ├─ [be] Docker build → ECR push → EKS 배포 (ArgoCD)
  └─ [infra] Terraform validate → plan → apply (수동 승인)
```

---

## 바로 가기

- [Frontend 배포 환경 →](./fe/00-overview)
