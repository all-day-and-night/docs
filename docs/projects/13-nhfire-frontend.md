# NH농협손해보험 Frontend Vue 전환

::: info 프로젝트 개요
- **기간**: 2026.04 ~ 진행중
- **역할**: Frontend Developer (Platform Engineering)
- **소속**: NH농협손해보험
- **특징**: 외부망(AI 활용) → 폐쇄망(실 개발) 이중 망 구조 + Claude Code Harness 기반 개발 자동화
:::

---

## 배경 및 목적

금융권 보안 정책상 **외부망과 폐쇄망이 분리**된 환경에서 Vue 3 + TypeScript 기반 SPA 전환을 진행.  
AI 코딩 도구(Claude Code)는 외부망에서만 사용 가능하므로 역할을 명확히 분리했다.

- **외부망**: LLM(Claude Code)을 활용한 퍼블리싱·공통 컴포넌트 개발 (화면 골격 + 디자인 시스템)
- **폐쇄망**: FE 개발자가 실제 API를 연결하고 비즈니스 로직을 완성하는 실 개발

각 망에 맞는 VCS + CI/CD를 별도로 구성하되, 외부망 인프라(GitLab, GitLab Runner, CloudFront, ACM, WAF)는 **Terraform**으로 코드로 관리하여 재현 가능성과 보안 설정 일관성을 확보.

---

## 망 분리 아키텍처

```
외부망 (LLM 활용 가능 — Terraform 관리)
    ├─ Claude Code Harness
    │   ├─ scaffold-component  → 공통 컴포넌트(Nh*) 설계서 + 구현 자동 생성
    │   └─ develop-screen      → 화면 퍼블리싱 스캐폴딩
    ├─ Self-managed GitLab     → 외부망 코드 관리 (EC2)
    ├─ GitLab Runner           → lint / test / build 자동화
    └─ 배포 파이프라인
        ├─ ACM                 → SSL/TLS 인증서 발급·관리
        ├─ WAF                 → IP 허용/차단, 요청 필터링
        └─ CloudFront + S3     → 빌드 산출물 정적 호스팅
                ↓ 코드 이관 (퍼블리싱 완료 화면)
폐쇄망 (AI 코딩 도구 사용 불가)
    ├─ 내부 Git Repository     → 실 개발 코드 관리
    ├─ FE 개발자               → 외부망 산출물에 실제 API 연결 + 비즈니스 로직 완성
    └─ Jenkins (Groovy 스크립트) → 빌드 / 배포 자동화
```

---

## 프로젝트 구조

```
monorepo (Turborepo + pnpm)
├── apps/
│   ├── mhp-web/          # 메인 웹앱 (Capacitor)
│   └── pilot-app/        # 파일럿 앱
└── packages/
    ├── ui-components/    # @mhp/ui-components (Nh* 디자인 시스템)
    ├── shared-common/    # composables / utils / api
    └── native-bridge/    # Capacitor 네이티브 브리지
```

---

## 주요 구현

### 1. Vue 3 SPA 프로젝트 세팅

- **스택**: Vue 3.5 · TypeScript · Vite 7 · Vue Router 5 · Pinia · TanStack Query · Tailwind CSS 4 · Capacitor 8
- **상태 분리**: 서버 데이터는 TanStack Query, 클라이언트 UI 상태는 Pinia
- **모듈 구조**: `modules/{domain}/` 단위로 api / components / composables / stores / views / router 분리
- **디자인 시스템**: `Nh` prefix 컴포넌트 라이브러리 구축 (레거시 `Base` prefix와 구분)

### 2. 외부망 — GitLab + 배포 파이프라인 (Terraform)

외부망 인프라 전체를 Terraform으로 관리하여 환경 재현과 보안 설정 일관성을 확보했다.

```hcl
# 주요 리소스 구성 예시

# GitLab 서버 (EC2)
resource "aws_instance" "gitlab" {
  ami           = var.gitlab_ami
  instance_type = "t3.large"
  vpc_security_group_ids = [aws_security_group.gitlab.id]
}

# ACM 인증서
resource "aws_acm_certificate" "frontend" {
  domain_name       = var.domain
  validation_method = "DNS"
}

# WAF WebACL — IP 허용 목록 + 공통 룰셋
resource "aws_wafv2_web_acl" "frontend" {
  scope = "CLOUDFRONT"
  rule {
    name     = "AllowOfficeIP"
    priority = 1
    action { allow {} }
    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.office.arn
      }
    }
    visibility_config { ... }
  }
}

# CloudFront 배포
resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.dist.bucket_regional_domain_name
    origin_id   = "s3-frontend"
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.oai.cloudfront_access_identity_path
    }
  }
  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate.frontend.arn
    ssl_support_method  = "sni-only"
  }
  web_acl_id = aws_wafv2_web_acl.frontend.arn
}
```

**GitLab CI/CD 파이프라인**

```yaml
# .gitlab-ci.yml
stages: [lint, test, build, deploy]

lint:   { script: pnpm lint }
test:   { script: pnpm test }
build:
  script: pnpm build:web
  artifacts:
    paths: [apps/mhp-web/dist]

deploy:
  stage: deploy
  only: [main]
  script:
    - aws s3 sync apps/mhp-web/dist s3://$DIST_BUCKET --delete
    - aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

- **Turborepo 캐시** 활용 → 변경된 패키지만 빌드·테스트, CI 시간 단축
- **WAF IP 제한** → 외부망 개발 서버에 허가된 IP만 접근 가능

### 3. 폐쇄망 — Jenkins Groovy 파이프라인 구축

```groovy
// Jenkinsfile
pipeline {
    agent any
    stages {
        stage('Install') { steps { sh 'pnpm install --frozen-lockfile' } }
        stage('Build')   { steps { sh 'pnpm build:web' } }
        stage('Deploy')  {
            when { branch 'main' }
            steps { sh './scripts/deploy.sh' }
        }
    }
}
```

- AI 도구 없는 환경에서 **Jenkins Groovy 스크립트**로 빌드·배포 자동화
- 내부 Git Repository 웹훅으로 파이프라인 트리거

### 4. Claude Code Harness 기반 개발 자동화 (외부망)

**컴포넌트 개발 (`scaffold-component`)**

```
"NhButton 만들어줘"
    → create-component-doc   설계서 + .types.ts 인터페이스 정의
    → implement-component    Vue 구현 + 테스트 + Storybook 일괄 생성
```

**화면 퍼블리싱 (`develop-screen`)**

```
"로그인 화면 개발해줘"
    → 도메인·화면 정보 수집
    → workflow / standards / references 자동 참조
    → modules/{domain}/ 파일 스캐폴딩 (api / store / view / router)
```

외부망에서 Harness로 생성된 컴포넌트·화면 골격을 폐쇄망에서 실 데이터와 연결하는 방식으로 역할 분리.

### 5. 퍼블리싱 검증 프로세스 자동화

퍼블리싱 완료 후 디자이너·기획 검증까지의 흐름을 **Google Sheet 기반 이력 관리**로 추적하고,  
검증 완료 시 **Claude Code Harness가 소스 메타데이터를 자동 업데이트**하는 방식으로 업무를 개선했다.

#### 검증 흐름

```
퍼블리셔 (Harness로 화면 구현 완료)
    ↓ Google Sheet 상태: 퍼블리싱완료
디자이너 검증 (디자인 시안 대비 UI 확인)
    ↓ Google Sheet 상태: 디자인검증완료
기획 검증 (요구사항 대비 동작·흐름 확인)
    ↓ Google Sheet 상태: 최종완료
Claude Code Harness (자동 트리거)
    → 해당 화면 소스 메타데이터 업데이트
    → GitLab CI 파이프라인 자동 실행 → 배포
```

#### Google Sheet 검증 이력 구조

| 컬럼 | 설명 |
|------|------|
| `screen_id` | 화면 고유 ID (모듈/도메인 기반) |
| `screen_name` | 화면명 |
| `published_at` | 퍼블리싱 완료 일시 |
| `design_status` | 디자인 검증 상태 (대기 / 검증중 / 완료 / 반려) |
| `design_reviewer` | 디자인 검증 담당자 |
| `plan_status` | 기획 검증 상태 (대기 / 검증중 / 완료 / 반려) |
| `plan_reviewer` | 기획 검증 담당자 |
| `final_status` | 최종 상태 (완료 / 반려) |
| `note` | 반려 사유 / 수정 요청 사항 |

#### Harness 메타데이터 자동 업데이트

Google Sheet의 `final_status`가 **완료**로 변경되면, Claude Code Harness 스크립트가 해당 화면의 메타데이터 파일을 자동으로 업데이트한다.

```typescript
// modules/{domain}/views/{screen}.meta.ts — 자동 갱신 대상
export const screenMeta = {
  screenId: "login-main",
  screenName: "로그인",
  publishedAt: "2026-04-15",
  verifiedAt: "2026-04-18",       // Harness가 자동 기입
  verifiedBy: {
    design: "김디자인",
    plan: "이기획",
  },
  status: "verified",             // publishing → verified 로 자동 전환
  readyForApi: true,              // 폐쇄망 개발자에게 API 연결 준비 완료 신호
} as const;
```

```
[Harness 실행 흐름]
Google Sheet 조회 (Apps Script Webhook or 수동 트리거)
    → final_status === "완료" 인 화면 목록 추출
    → 각 화면의 .meta.ts 파일 갱신 (verifiedAt / verifiedBy / status / readyForApi)
    → GitLab commit & push → CI 파이프라인 자동 실행
```

- **효과**: 검증 완료 → 메타데이터 반영 → 폐쇄망 이관까지의 수동 작업 제거
- **가시성 확보**: `readyForApi: true` 플래그로 폐쇄망 FE 개발자가 API 연결 가능한 화면을 즉시 식별 가능
- **반려 추적**: `final_status === "반려"` 시 `note` 컬럼의 수정 요청 사항을 Harness가 주석으로 소스에 삽입하여 재작업 컨텍스트 보존

---

## 문제 해결 사례

### 문제 1: Tailwind 4.x `@apply` in `<style scoped>` 미적용

**원인**: Tailwind 4에서 scoped 스타일 내 유틸리티 클래스 참조가 기본 비활성화  
**해결**: `<style scoped>` 첫 줄에 `@reference "@assets/main.css"` 추가를 컨벤션으로 확립  
**결과**: 전체 컴포넌트에 일관 적용

---

## 핵심 학습

- **망 분리 워크플로우**: LLM이 퍼블리싱을 담당하고 FE 개발자가 API 연결에 집중하도록 역할을 분리하면 AI 도구 제약 환경에서도 생산성 손실을 최소화할 수 있음
- **Terraform으로 외부망 인프라 관리**: GitLab·CloudFront·WAF·ACM을 코드로 관리하면 금융권 보안 요건(IP 제한, HTTPS 강제)을 일관성 있게 유지 가능
- **Harness 설계**: 설계서 작성(sub-agent 1) → 구현(sub-agent 2) 분리로 각 단계 품질 독립 검증 가능
- **검증 프로세스 자동화**: Google Sheet를 단일 진실 공급원(SSOT)으로 삼아 퍼블리셔·디자이너·기획 검증 이력을 관리하고, 완료 시 Harness가 소스 메타데이터를 자동 갱신하면 수동 인계 작업이 사라짐
- **이중 CI/CD**: 외부망(GitLab CI + CloudFront) / 폐쇄망(Jenkins) 각각의 특성에 맞는 파이프라인 설계가 필요
- **WAF + CloudFront 조합**: 외부망 개발 서버를 인터넷에 노출하되 IP 허용 목록으로 접근을 제어하는 패턴이 금융권 보안 정책에 적합
