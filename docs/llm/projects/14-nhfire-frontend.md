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
AI 코딩 도구(Claude Code)는 외부망에서만 사용 가능하므로,  
**외부망에서 퍼블리싱·공통 컴포넌트 개발 → 폐쇄망으로 이관 후 실 개발**하는 워크플로우를 구축.  
각 망에 맞는 VCS + CI/CD를 별도로 구성하여 생산성과 보안을 동시에 확보.

---

## 망 분리 아키텍처

```
외부망 (AI 코딩 도구 사용 가능)
    ├─ Claude Code Harness
    │   ├─ scaffold-component  → 공통 컴포넌트(Nh*) 설계서 + 구현 자동 생성
    │   └─ develop-screen      → 화면 스캐폴딩 (퍼블리싱)
    ├─ Self-managed GitLab     → 외부망 코드 관리
    └─ GitLab Runner + CI/CD   → lint / test / build 자동화
            ↓ 코드 이관
폐쇄망 (AI 코딩 도구 사용 불가)
    ├─ 내부 Git Repository     → 실 개발 코드 관리
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

### 2. 외부망 — GitLab 서버 + CI/CD 구축

```
Self-managed GitLab
    ├─ HTTPS / 브랜치 보호 정책 설정
    └─ GitLab Runner (Shell Executor)
```

```yaml
# .gitlab-ci.yml
stages: [lint, test, build]

lint:   { script: pnpm lint }
test:   { script: pnpm test }
build:
  script: pnpm build:web
  artifacts:
    paths: [apps/mhp-web/dist]
```

- **Turborepo 캐시** 활용 → 변경된 패키지만 빌드·테스트, CI 시간 단축

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

---

## 문제 해결 사례

### 문제 1: Tailwind 4.x `@apply` in `<style scoped>` 미적용

**원인**: Tailwind 4에서 scoped 스타일 내 유틸리티 클래스 참조가 기본 비활성화  
**해결**: `<style scoped>` 첫 줄에 `@reference "@assets/main.css"` 추가를 컨벤션으로 확립  
**결과**: 전체 컴포넌트에 일관 적용

---

## 핵심 학습

- **망 분리 워크플로우**: AI 도구를 쓸 수 있는 환경과 없는 환경의 역할을 명확히 나누면 생산성 손실을 최소화
- **Harness 설계**: 설계서 작성(sub-agent 1) → 구현(sub-agent 2) 분리로 각 단계 품질 독립 검증 가능
- **이중 CI/CD**: 외부망(GitLab CI) / 폐쇄망(Jenkins) 각각의 특성에 맞는 파이프라인 설계가 필요
- **Self-managed GitLab**: 금융권 보안 요건 충족 + Runner 환경 직접 통제 가능
