# Frontend 배포 환경 구성 — 개요

> **목적:** GitLab CI/CD를 통해 Frontend 빌드 산출물을 S3에 업로드하고, CloudFront로 서빙하는 배포 파이프라인 구성

---

## 아키텍처

```
개발자 로컬
    │ git push (main 브랜치)
    ▼
GitLab CI/CD 파이프라인
    │
    ├─ [build stage]
    │    Runner (Docker Executor)
    │    image: node:24-slim
    │    pnpm install → turbo build
    │    → dist/ 파일을 artifact로 보존
    │
    └─ [deploy stage]
         Runner (Docker Executor)
         image: amazon/aws-cli
         aws s3 sync dist/ → S3 버킷
         aws cloudfront create-invalidation
              │
              ▼
         CloudFront CDN
              │
              ▼
         최종 사용자 (HTTPS)
```

---

## 핵심 구성 요소

| 구성 요소 | 역할 |
|-----------|------|
| GitLab CI/CD | 파이프라인 실행, 브랜치 트리거, 아티팩트 전달 |
| Docker Runner | 각 job을 격리된 컨테이너에서 실행 |
| node:24-slim | pnpm + Turbo 빌드 환경 |
| amazon/aws-cli | S3 업로드, CloudFront 무효화 CLI |
| AWS S3 | 빌드 산출물(정적 파일) 저장 |
| AWS CloudFront | 글로벌 CDN, HTTPS 서빙, 캐싱 |

---

## 선택 이유

| 비교 항목 | S3 + CloudFront | 컨테이너 서버 |
|-----------|----------------|--------------|
| 운영 복잡도 | 낮음 (서버 없음) | 높음 (서버 관리 필요) |
| 비용 | 매우 낮음 (요청/전송량 과금) | 상시 EC2/EKS 비용 발생 |
| 글로벌 배포 | CloudFront Edge로 자동 | 별도 구성 필요 |
| 적합한 경우 | SPA, 정적 파일 | SSR, API 서버 |

---

## 단계별 가이드

1. [파이프라인 구성](./01-pipeline) — `.gitlab-ci.yml` 전체 구조
2. [빌드 단계](./02-build) — pnpm + Turbo, 캐시 전략
3. [배포 단계](./03-deploy) — S3 sync, CloudFront 무효화
4. [AWS 자격증명 설정](./04-aws-credentials) — GitLab CI/CD Variables, IAM 권한
