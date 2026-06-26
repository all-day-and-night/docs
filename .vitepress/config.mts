import {fileURLToPath, URL} from "node:url";
import {defineConfig} from "vitepress";
import {searchPlugin} from "./plugins/search-plugin";

const docsDir = fileURLToPath(new URL("../docs", import.meta.url));

// https://vitepress.dev/reference/site-config
export default defineConfig({
  vite: {
    server: {
      port: 7001,
    },
    plugins: [searchPlugin(docsDir)],
  },
  lang: "ko-KR",
  head: [["link", {rel: "icon", href: "/favicon.ico"}]],

  base: '/',
  cleanUrls: true,

  srcDir: "docs",

  title: "Tech Notes",
  description: "A VitePress Site",
  themeConfig: {
    outline: {
      label: "목차",
      level: [2, 3],
    },
    nav: [
      {text: "홈", link: "/"},
      {text: "프로젝트 이력", link: "/projects/"},
      {
        text: "인프라 & 배포",
        items: [
          {text: "AWS 인프라 구축", link: "/aws-infra/00-overview"},
          {text: "K8s 하이브리드 배포", link: "/traffic/agent-be-k8s-hybrid/00-overview"},
        ],
      },
      {
        text: "LLM 최적화",
        items: [
          {text: "Agent BE 대규모 트래픽 처리", link: "/traffic/00-overview"},
          {text: "추론 성능 개선", link: "/inference-optimization/00-overview"},
        ],
      },
      {text: "트러블슈팅", link: "/troubleshooting/01-terraform-force-replace"},
      {text: "실습 계획", link: "/plan"},
    ],

    sidebar: {
      "/": [
        // ── Level 1: 단독 섹션 ──────────────────────────────
        {
          text: "트러블슈팅",
          collapsed: true,
          items: [
            {text: "Terraform 강제 교체 & 자원 관리", link: "/troubleshooting/01-terraform-force-replace"},
          ],
        },
        {
          text: "실습 계획 & 현황",
          collapsed: false,
          items: [
            {text: "AI Inference Platform 계획", link: "/plan"},
            {text: "진행 현황", link: "/progress"},
          ],
        },
        {
          text: "프로젝트 이력",
          collapsed: true,
          items: [
            {text: "전체 인덱스", link: "/projects/"},
            {text: "차세대 행복e음", link: "/projects/01-happy-eeum"},
            {text: "MOP AWS EKS 인프라", link: "/projects/02-mop-eks"},
            {text: "LGE 모니터 신청", link: "/projects/03-lge-monitor"},
            {text: "미래엔 AI 교과서", link: "/projects/04-mirae-n"},
            {text: "LGD 뉴스 기업 분석", link: "/projects/05-lgd-news-analysis"},
            {text: "LGE 메뉴얼 생성", link: "/projects/06-lge-manual"},
            {text: "LGD 메일 AI Agent", link: "/projects/07-lgd-mail-agent"},
            {text: "DnO AI Agent", link: "/projects/08-dno-agent"},
            {text: "신한카드 여행 앱", link: "/projects/09-shinhan-travel"},
            {text: "KDB 생명 Agentic AI", link: "/projects/10-kdb-life"},
            {text: "스타벅스 BI Agent", link: "/projects/11-starbucks-bi"},
            {text: "MOP Agent (DeepAgent)", link: "/projects/12-mop-agent"},
            {text: "NH농협손해보험 FE Vue 전환", link: "/projects/13-nhfire-frontend"},
            {text: "EKS LLM 인프라 실습", link: "/projects/14-eks-llm-infra"},
          ],
        },

        // ── Level 1: 인프라 & 배포 ──────────────────────────
        {
          text: "인프라 & 배포",
          collapsed: false,
          items: [
            // Level 2
            {
              text: "AWS 인프라 구축",
              collapsed: true,
              items: [
                // Level 3
                {text: "개요 & 아키텍처", link: "/aws-infra/00-overview"},
                {text: "사전 준비 & Bootstrap", link: "/aws-infra/01-bootstrap"},
                {text: "VPC + GitLab EC2", link: "/aws-infra/02-vpc-gitlab"},
                {text: "EKS 클러스터", link: "/aws-infra/03-eks-cluster"},
                {text: "GitLab Runner 설정", link: "/aws-infra/04-gitlab-runner"},
                {text: "CI/CD 파이프라인", link: "/aws-infra/05-cicd-pipeline"},
                {text: "향후 계획 (Kubeflow)", link: "/aws-infra/06-future-plan"},
                {text: "도메인 & SSL 설정", link: "/aws-infra/07-domain-ssl"},
                {text: "트러블슈팅", link: "/aws-infra/troubleshooting"},
              ],
            },
            // Level 2
            {
              text: "Frontend CI/CD 배포",
              collapsed: true,
              items: [
                // Level 3
                {text: "개요 & 배포 흐름", link: "/ci-cd/fe/00-overview"},
                {text: "파이프라인 구성", link: "/ci-cd/fe/01-pipeline"},
                {text: "빌드 단계 (pnpm + Turbo)", link: "/ci-cd/fe/02-build"},
                {text: "배포 단계 (S3 + CloudFront)", link: "/ci-cd/fe/03-deploy"},
                {text: "AWS 자격증명 설정", link: "/ci-cd/fe/04-aws-credentials"},
              ],
            },
            // Level 2
            {
              text: "Backend EKS 배포",
              collapsed: true,
              items: [
                // Level 3
                {text: "개요 & GitOps 아키텍처", link: "/ci-cd/be/00-overview"},
                {text: "Terraform — EKS 인프라", link: "/ci-cd/be/01-terraform"},
                {text: "ArgoCD — App of Apps", link: "/ci-cd/be/02-argocd"},
                {text: "Blue/Green — Argo Rollouts", link: "/ci-cd/be/03-blue-green"},
                {text: "HPA + Karpenter", link: "/ci-cd/be/04-hpa-karpenter"},
                {text: "GitLab CI — ECR + GitOps", link: "/ci-cd/be/05-pipeline"},
                {text: "도메인 접속 & 보안 관리", link: "/ci-cd/be/06-domain-access"},
                {text: "RDS & Connection Pool", link: "/ci-cd/be/07-rds-connection-pool"},
              ],
            },
            // Level 2
            {
              text: "K8s 하이브리드 배포",
              collapsed: true,
              items: [
                // Level 3
                {text: "개요 & 배포 전략", link: "/traffic/agent-be-k8s-hybrid/00-overview"},
                {text: "k8s 매니페스트 구성", link: "/traffic/agent-be-k8s-hybrid/01-k8s-manifests"},
                {text: "앱 컴포넌트 & API", link: "/traffic/agent-be-k8s-hybrid/02-app-components"},
                {text: "Rancher Desktop 배포", link: "/traffic/agent-be-k8s-hybrid/03-rancher-deploy"},
                {text: "트러블슈팅", link: "/traffic/agent-be-k8s-hybrid/04-troubleshooting"},
              ],
            },
          ],
        },

        // ── Level 1: LLM 최적화 ─────────────────────────────
        {
          text: "LLM 최적화",
          collapsed: false,
          items: [
            // Level 2
            {
              text: "대규모 트래픽 처리",
              collapsed: true,
              items: [
                // Level 3
                {text: "개요 & 전체 아키텍처", link: "/traffic/00-overview"},
                {text: "Redis 시맨틱 캐시", link: "/traffic/01-redis-semantic-cache"},
                {text: "Idempotency Key", link: "/traffic/02-idempotency"},
                {text: "Rate Limiting", link: "/traffic/03-rate-limiting"},
                {text: "Exponential Backoff", link: "/traffic/04-exponential-backoff"},
                {text: "Circuit Breaker", link: "/traffic/05-circuit-breaker"},
                {text: "SSE 스트리밍", link: "/traffic/06-sse-streaming"},
                {text: "Redis Streams", link: "/traffic/07-redis-streams"},
                {text: "Celery 백그라운드", link: "/traffic/08-celery"},
                {text: "Observability", link: "/traffic/09-observability"},
              ],
            },
            // Level 2
            {
              text: "추론 성능 개선",
              collapsed: true,
              items: [
                // Level 3
                {text: "전체 개요", link: "/inference-optimization/00-overview"},
                {text: "서빙 엔진 - vLLM", link: "/inference-optimization/01-vllm"},
                {text: "양자화 - AWQ / GPTQ", link: "/inference-optimization/02-quantization"},
                {text: "Context 최적화", link: "/inference-optimization/03-context-optimization"},
                {text: "모델 라우팅", link: "/inference-optimization/04-model-routing"},
                {text: "캐싱", link: "/inference-optimization/05-caching"},
                {text: "인프라 최적화", link: "/inference-optimization/06-infra"},
                {text: "메트릭 취합 및 성능 개선", link: "/inference-optimization/07-metrics"},
                {text: "LMCache + Redis", link: "/inference-optimization/08-lmcache-redis"},
              ],
            },
            // Level 2
            {
              text: "서빙 도구 비교",
              collapsed: true,
              items: [
                // Level 3
                {text: "vLLM", link: "/inference-optimization/serving-tools/tool-vllm"},
                {text: "TensorRT-LLM", link: "/inference-optimization/serving-tools/tool-tensorrt-llm"},
                {text: "Triton Inference Server", link: "/inference-optimization/serving-tools/tool-triton"},
                {text: "AWQ 연계", link: "/inference-optimization/serving-tools/tool-awq-integration"},
                {text: "도구 비교", link: "/inference-optimization/serving-tools/tool-comparison"},
              ],
            },
            // Level 2
            {
              text: "EKS GPU 서빙 실습",
              collapsed: true,
              items: [
                // Level 3
                {text: "프로젝트 개요", link: "/inference-optimization/llm-serve/00-overview"},
                {text: "EKS 인프라 구성", link: "/inference-optimization/llm-serve/01-eks-infra"},
                {text: "Option A — vLLM", link: "/inference-optimization/llm-serve/02-option-a-vllm"},
                {text: "Option B — TensorRT-LLM", link: "/inference-optimization/llm-serve/03-option-b-trtllm"},
                {text: "Option C — Triton", link: "/inference-optimization/llm-serve/04-option-c-triton"},
                {text: "Option D — Stable Diffusion", link: "/inference-optimization/llm-serve/05-option-d-sd"},
                {text: "트러블슈팅 모음", link: "/inference-optimization/llm-serve/07-troubleshooting"},
              ],
            },
          ],
        },
      ],
    },
  },
});
