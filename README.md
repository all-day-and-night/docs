# Tech Notes — 포트폴리오 & 실습 문서 사이트

**https://docs.dex-playground.com**

---

## 주원웅 — Platform Engineer & AI Developer

LG CNS 플랫폼엔지니어링팀에서 **AI/LLM 서비스 개발**과 **AWS 클라우드 인프라 구축**을 담당하고 있습니다. (2022.07 ~)

LLM Agent, RAG, AWS Bedrock 기반 AI 서비스 설계·구현부터 Terraform EKS 인프라, FastAPI/Spring Boot 백엔드, Vue 3/React 프론트엔드까지 **풀스택 + 클라우드** 전반을 담당합니다.

### 보유 역량

| 영역 | 기술 |
|------|------|
| AI / LLM | LangChain, DeepAgent, Strands Agents, RAG, OpenSearch, vLLM, Bedrock, Llama, Exaone |
| Cloud / IaC | AWS EKS, SageMaker, Lambda, Terraform, Route 53, CloudFront, ECR |
| Backend | Spring Boot, FastAPI, Java, Python, Spring Batch |
| Frontend | Vue 3, React, TypeScript, Vite, Pinia, Tailwind, Capacitor |
| DevOps | GitLab CI/CD, Jenkins, Docker, Kubernetes, Turborepo, pnpm |
| 성능 / 관측 | Prometheus, Grafana, Redis, Locust, 비동기 처리, SQL 튜닝 |

### 주요 프로젝트 이력

| 프로젝트 | 기간 | 역할 & 핵심 내용 |
|----------|------|----------------|
| **LGD 메일 AI Agent** | 2025.01 ~ 2025.06 | LG 디스플레이 사내 메일에 LLM 기반 요약·초안·멀티턴 대화 기능 추가. 아키텍처 설계부터 비동기 구현, 부하 테스트까지 2인 전담 |
| **MOP Agent (DeepAgent)** | 2026.01 ~ 2026.02 | Optapex 광고 플랫폼 Multi-Agent 시스템 구축. Super Agent 1 + Sub-Agent 3 + RAG. 데이터 서치 & 리포트 생성 Sub-Agent 담당. Skill 기반 워크플로우·Middleware 데이터 전달 설계 |
| **DnO 생성형 AI Agent** | 2025.06 ~ 2025.07 | AWS Bedrock + OpenSearch 기반 RAG 아키텍처로 생성형 AI Agent 구축 |
| **KDB 생명 Agentic AI PoC** | 2025.10 ~ 2025.11 | git diff 알고리즘으로 보험 약관 변경 라인 감지, 목차·페이지·라인 정보 포함 변경 대비표 생성 후 S3 Presigned URL 다운로드 |
| **LGE 메뉴얼 생성 자동화** | 2024.11 ~ 2024.12 | LLM이 XML 형태로 매뉴얼 생성 → PPT 템플릿 태그 치환 방식으로 슬라이드 자동 생성 |
| **LGD 뉴스 기업 분석** | 2024.11 ~ 2024.12 | asyncio.gather + httpx.AsyncClient로 외부 뉴스 API 비동기 병렬 호출, 응답 시간 최대 66% 단축 |
| **MOP AWS EKS 인프라** | 2023.07 ~ 2024.02 | Terraform IaC로 ML 학습·추론 파이프라인 AWS 자동화. VPC + EKS + SageMaker + GitLab CI/CD 전 과정 구축 |
| **NH농협손해보험 FE Vue 전환** | 2026.04 ~ | 레거시 프론트엔드를 Vue 3 기반으로 전환, Claude Code Harness 활용 AI 보조 개발 적용 |
| **AWS EKS LLM 인프라 실습** | 2026.06 ~ 진행 중 | 개인 실습용 AI Inference Platform. EKS 클러스터 + vLLM + TensorRT-LLM + Triton 서빙, 트래픽 처리까지 |

---

## 콘텐츠 구성

| 섹션 | 내용 |
|------|------|
| 프로젝트 이력 | 실무 참여 프로젝트 14건 상세 기록 |
| AWS 인프라 구축 | Terraform Bootstrap → VPC → EKS → GitLab Runner → CI/CD → 도메인 & SSL |
| 대규모 트래픽 처리 | Redis 캐시, Rate Limiting, Circuit Breaker, SSE 스트리밍, Celery, Observability |
| 추론 성능 개선 | vLLM, Quantization, Context 최적화, Model Routing, 서빙 도구 비교 |
| K8s 하이브리드 배포 | K8s 매니페스트, App 컴포넌트, Rancher 배포 |

---

## 로컬 실행 가이드

### 1. Node.js 설치

[https://nodejs.org](https://nodejs.org) 에서 **v18 이상** 설치

```bash
node -v   # v18.x 이상 확인
```

### 2. pnpm 설치

```bash
npm install -g pnpm
```

### 3. 저장소 클론 & 의존성 설치

```bash
git clone <repository-url>
cd docs
pnpm install
```

### 4. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 **http://localhost:7001** 접속

### 5. (선택) 빌드 & 미리보기

```bash
pnpm build      # 정적 파일 빌드
pnpm preview    # 빌드 결과물 로컬 미리보기
```

---

## 인프라 구성

- **클라우드**: AWS (EC2, EKS, S3, Route 53, ACM)
- **IaC**: Terraform
- **CI/CD**: GitLab CI (Shell Executor, EC2 Runner)
- **정적 사이트**: VitePress 빌드 결과물을 EC2에서 서빙
- **도메인 & SSL**: Route 53 + ACM

> AWS 자원은 비용 관리를 위해 필요 시에만 가동합니다.  
> 사이트가 접속되지 않을 경우 위 로컬 실행 가이드를 참고하세요.

---

## 문서 구조

```
docs/
├── index.md                        # 홈 페이지 (포트폴리오)
├── plan.md                         # AI Inference Platform 실습 계획
├── progress.md                     # 진행 상황
├── aws-infra/                      # AWS 인프라 구축 단계별 가이드
│   ├── 00-overview.md
│   ├── 01-bootstrap.md
│   ├── 02-vpc-gitlab.md
│   ├── 03-eks-cluster.md
│   ├── 04-gitlab-runner.md
│   ├── 05-cicd-pipeline.md
│   ├── 06-future-plan.md
│   ├── 07-domain-ssl.md
│   └── troubleshooting.md
├── traffic/                        # 대규모 트래픽 처리
│   ├── 00-overview.md ~ 09-observability.md
│   └── agent-be-k8s-hybrid/
├── inference-optimization/         # 추론 성능 개선
│   ├── 00-overview.md ~ 08-lmcache-redis.md
│   ├── serving-tools/
│   └── llm-serve/
└── projects/                       # 프로젝트 이력
    ├── index.md
    ├── 01-happy-eeum.md
    ├── 02-mop-eks.md
    ├── 03-lge-monitor.md
    ├── 04-mirae-n.md
    ├── 05-lgd-news-analysis.md
    ├── 06-lge-manual.md
    ├── 07-lgd-mail-agent.md
    ├── 08-dno-agent.md
    ├── 09-shinhan-travel.md
    ├── 10-kdb-life.md
    ├── 11-starbucks-bi.md
    ├── 12-mop-agent.md
    ├── 13-nhfire-frontend.md
    └── 14-eks-llm-infra.md
```

---

## 문서 추가 방법

1. `docs/` 아래 적절한 위치에 `.md` 파일 생성
2. `.vitepress/config.mts`의 `sidebar`에 항목 추가

```ts
{
  text: "섹션 이름",
  items: [
    { text: "페이지 제목", link: "/경로/파일명" },
  ],
}
```
