# 파이프라인 구성

> ← [개요로 돌아가기](./00-overview)

---

## 전체 `.gitlab-ci.yml` 구조

```yaml
workflow:
  auto_cancel:
    on_new_commit: interruptible   # 새 커밋 시 interruptible job 자동 취소
  rules:
    - if: $CI_COMMIT_BRANCH == "main"   # main 브랜치에만 파이프라인 실행

default:
  tags:
    - docker   # Docker Executor를 가진 Runner에서 실행

variables:
  PNPM_VERSION: "10.33.2"
  S3_BUCKET: "your-s3-bucket-name"
  PNPM_STORE_DIR: ".pnpm-store"
  TURBO_CACHE_DIR: ".turbo/cache"
  HUSKY: "0"                       # CI 환경에서 git hooks 비활성화
  TURBO_TELEMETRY_DISABLED: "1"
  CI_ROLLUP_DTS: "false"

stages:
  - build
  - deploy
```

---

## workflow 설정

### auto_cancel
새 커밋이 push되면 이전 실행 중인 파이프라인을 자동으로 취소한다.  
`interruptible: true`로 설정된 job만 취소 대상이다.

```yaml
workflow:
  auto_cancel:
    on_new_commit: interruptible
```

- 빠르게 연속으로 push할 때 불필요한 빌드 낭비를 방지
- deploy job은 `interruptible: false`(기본값)이므로 진행 중 배포는 취소되지 않음

### rules — 브랜치 제한

```yaml
workflow:
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

main 브랜치 push 시에만 파이프라인이 실행된다.  
feature 브랜치나 PR(Merge Request)에서는 파이프라인이 생성되지 않는다.

---

## default 태그 — Docker Runner

```yaml
default:
  tags:
    - docker
```

Runner에 `docker` 태그가 달려있어야 한다.  
Docker Executor Runner는 각 job을 독립된 컨테이너에서 실행하므로 환경 오염 없이 재현 가능한 빌드를 보장한다.

::: tip Runner 설정 확인
GitLab → Admin → Runners에서 Runner 태그를 확인할 수 있다.
:::

---

## stages

```yaml
stages:
  - build
  - deploy
```

두 stage가 **순차적**으로 실행된다. build가 실패하면 deploy는 시작되지 않는다.

| stage | job | 역할 |
|-------|-----|------|
| build | `build:app` | Node 이미지에서 pnpm 빌드, dist/ 생성 |
| deploy | `deploy:app` | AWS CLI로 S3 업로드 + CloudFront 무효화 |

---

## 전역 변수 (variables)

| 변수 | 설명 |
|------|------|
| `PNPM_VERSION` | pnpm 고정 버전 (corepack에서 사용) |
| `S3_BUCKET` | 배포 대상 S3 버킷 이름 |
| `PNPM_STORE_DIR` | pnpm store 경로 (캐시 대상) |
| `TURBO_CACHE_DIR` | Turbo 캐시 경로 (캐시 대상) |
| `HUSKY` | CI 환경에서 git hooks 비활성화 (`0`으로 설정) |
| `TURBO_TELEMETRY_DISABLED` | Turbo 원격 텔레메트리 비활성화 |
| `CI_ROLLUP_DTS` | 타입 선언 파일 생성 비활성화 (빌드 속도 향상) |

::: warning 민감한 값은 CI/CD Variables에
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CF_DIST_ID` 같은 민감 정보는 `variables` 블록에 넣지 않고 GitLab CI/CD Settings → Variables에 등록한다.  
→ [AWS 자격증명 설정](./04-aws-credentials) 참고
:::

---

## 다음 단계

- [빌드 단계 상세 →](./02-build)
