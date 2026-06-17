# LLM 실습 노트 — Tech Notes

AI Inference Platform 실습 내용을 정리한 VitePress 기반 문서 사이트입니다.

Local LLM 서빙부터 AWS EKS 배포, GitLab CI/CD, 성능 최적화, 프로젝트 이력까지 실습 기반으로 정리합니다.

---

## 기술 스택

- [VitePress](https://vitepress.dev/) 2.0.0-alpha
- pnpm
- FlexSearch (전문 검색)

---

## 로컬 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 시작 (http://localhost:7001/)
pnpm dev
```

---

## 빌드

```bash
# 정적 파일 빌드 (.vitepress/dist/)
pnpm build

# 빌드 결과물 로컬 미리보기
pnpm preview
```

---

## 문서 구조

```
docs/
├── index.md                        # 홈 페이지
└── llm/
    ├── index.md                    # AI Inference Platform 실습 계획
    ├── progress.md                 # 진행 상황
    ├── aws-infra/                  # AWS 인프라 구축 단계별 가이드
    │   ├── 00-overview.md          # 아키텍처 & 진행 현황 & 비용
    │   ├── 01-bootstrap.md         # 사전 도구 & Terraform Bootstrap
    │   ├── 02-vpc-gitlab.md        # VPC + GitLab EC2 구성
    │   ├── 03-eks-cluster.md       # EKS 클러스터 온오프
    │   ├── 04-gitlab-runner.md     # GitLab Runner 등록
    │   ├── 05-cicd-pipeline.md     # CI/CD 파이프라인
    │   ├── 06-future-plan.md       # Kubeflow + ML Pipeline 계획
    │   ├── 07-domain-ssl.md        # 도메인 & SSL 설정
    │   └── troubleshooting.md      # 오류 해결 모음
    ├── traffic/                    # 대규모 트래픽 처리
    │   ├── 00-overview.md          # 전체 아키텍처
    │   ├── 02-redis-semantic-cache.md
    │   ├── 03-idempotency.md
    │   ├── 04-rate-limiting.md
    │   ├── 05-exponential-backoff.md
    │   ├── 06-circuit-breaker.md
    │   ├── 08-sse-streaming.md
    │   ├── 09-celery.md
    │   ├── 10-observability.md
    │   └── agent-be-k8s-hybrid/    # Agent BE K8s 하이브리드
    │       ├── 00-overview.md
    │       ├── 01-k8s-manifests.md
    │       ├── 02-app-components.md
    │       └── 03-rancher-deploy.md
    ├── inference-optimization/     # 추론 성능 개선
    │   ├── 00-overview.md
    │   ├── 01-vllm.md
    │   ├── 02-quantization.md
    │   ├── 03-context-optimization.md
    │   ├── 04-model-routing.md
    │   ├── 05-caching.md
    │   ├── 06-infra.md
    │   └── serving-tools/          # 서빙 도구 비교
    │       ├── tool-vllm.md
    │       ├── tool-tensorrt-llm.md
    │       ├── tool-triton.md
    │       ├── tool-awq-integration.md
    │       └── tool-comparison.md
    └── projects/                   # 프로젝트 이력
        ├── index.md
        ├── 01-mop-eks.md
        ├── 02-happy-eeum.md
        ├── 03-lgd-mail-agent.md
        ├── 04-lgd-news-analysis.md
        ├── 05-lge-manual.md
        ├── 06-mirae-n.md
        ├── 07-lge-monitor.md
        ├── 08-dno-agent.md
        ├── 09-kdb-life.md
        ├── 10-shinhan-travel.md
        ├── 11-starbucks-bi.md
        ├── 12-mop-agent.md
        ├── 13-eks-llm-infra.md
        └── 14-nhfire-frontend.md
```

---

## 문서 추가 방법

1. `docs/llm/` 아래 적절한 위치에 `.md` 파일 생성
2. `.vitepress/config.mts` 의 `sidebar` 에 항목 추가

```ts
// config.mts sidebar 예시
{
  text: "섹션 이름",
  items: [
    { text: "페이지 제목", link: "/llm/경로/파일명" },
  ],
}
```

---

## CI/CD

GitLab Runner (Shell Executor, EC2)를 통해 파이프라인 실행

```yaml
# .gitlab-ci.yml
tags:
  - shell   # EC2 Runner 사용
```

→ [CI/CD 파이프라인 가이드](docs/llm/aws-infra/05-cicd-pipeline.md)
