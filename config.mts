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
      {text: "프로젝트 이력", link: "/llm/projects/"},
      {
        text: "인프라 & 배포",
        items: [
          {text: "AWS 인프라 구축", link: "/llm/aws-infra/00-overview"},
          {text: "K8s 하이브리드 배포", link: "/llm/traffic/agent-be-k8s-hybrid/00-overview"},
        ],
      },
      {
        text: "LLM 최적화",
        items: [
          {text: "Agent BE 대규모 트래픽 처리", link: "/llm/traffic/00-overview"},
          {text: "추론 성능 개선", link: "/llm/inference-optimization/00-overview"},
        ],
      },
      {text: "실습 계획", link: "/llm/"},
    ],

    sidebar: {
      "/llm/": [
        // ── Level 1: 단독 섹션 ──────────────────────────────
        {
          text: "실습 계획 & 현황",
          collapsed: false,
          items: [
            {text: "AI Inference Platform 계획", link: "/llm/"},
            {text: "진행 현황", link: "/llm/progress"},
          ],
        },
        {
          text: "프로젝트 이력",
          collapsed: true,
          items: [
            {text: "전체 인덱스", link: "/llm/projects/"},
            {text: "차세대 행복e음", link: "/llm/projects/02-happy-eeum"},
            {text: "MOP AWS EKS 인프라", link: "/llm/projects/01-mop-eks"},
            {text: "LGE 모니터 신청", link: "/llm/projects/07-lge-monitor"},
            {text: "미래엔 AI 교과서", link: "/llm/projects/06-mirae-n"},
            {text: "LGD 뉴스 기업 분석", link: "/llm/projects/04-lgd-news-analysis"},
            {text: "LGE 메뉴얼 생성", link: "/llm/projects/05-lge-manual"},
            {text: "LGD 메일 AI Agent", link: "/llm/projects/03-lgd-mail-agent"},
            {text: "DnO AI Agent", link: "/llm/projects/08-dno-agent"},
            {text: "신한카드 여행 앱", link: "/llm/projects/10-shinhan-travel"},
            {text: "KDB 생명 Agentic AI", link: "/llm/projects/09-kdb-life"},
            {text: "스타벅스 BI Agent", link: "/llm/projects/11-starbucks-bi"},
            {text: "MOP Agent (DeepAgent)", link: "/llm/projects/12-mop-agent"},
            {text: "NH농협손해보험 FE Vue 전환", link: "/llm/projects/14-nhfire-frontend"},
            {text: "EKS LLM 인프라 실습", link: "/llm/projects/13-eks-llm-infra"},
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
                {text: "개요 & 아키텍처", link: "/llm/aws-infra/00-overview"},
                {text: "사전 준비 & Bootstrap", link: "/llm/aws-infra/01-bootstrap"},
                {text: "VPC + GitLab EC2", link: "/llm/aws-infra/02-vpc-gitlab"},
                {text: "EKS 클러스터", link: "/llm/aws-infra/03-eks-cluster"},
                {text: "GitLab Runner 설정", link: "/llm/aws-infra/04-gitlab-runner"},
                {text: "CI/CD 파이프라인", link: "/llm/aws-infra/05-cicd-pipeline"},
                {text: "향후 계획 (Kubeflow)", link: "/llm/aws-infra/06-future-plan"},
                {text: "도메인 & SSL 설정", link: "/llm/aws-infra/07-domain-ssl"},
                {text: "트러블슈팅", link: "/llm/aws-infra/troubleshooting"},
              ],
            },
            // Level 2
            {
              text: "K8s 하이브리드 배포",
              collapsed: true,
              items: [
                // Level 3
                {text: "개요 & 배포 전략", link: "/llm/traffic/agent-be-k8s-hybrid/00-overview"},
                {text: "k8s 매니페스트 구성", link: "/llm/traffic/agent-be-k8s-hybrid/01-k8s-manifests"},
                {text: "앱 컴포넌트 & API", link: "/llm/traffic/agent-be-k8s-hybrid/02-app-components"},
                {text: "Rancher Desktop 배포", link: "/llm/traffic/agent-be-k8s-hybrid/03-rancher-deploy"},
                {text: "트러블슈팅", link: "/llm/traffic/agent-be-k8s-hybrid/04-troubleshooting"},
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
                {text: "개요 & 전체 아키텍처", link: "/llm/traffic/00-overview"},
                {text: "Redis 시맨틱 캐시", link: "/llm/traffic/01-redis-semantic-cache"},
                {text: "Idempotency Key", link: "/llm/traffic/02-idempotency"},
                {text: "Rate Limiting", link: "/llm/traffic/03-rate-limiting"},
                {text: "Exponential Backoff", link: "/llm/traffic/04-exponential-backoff"},
                {text: "Circuit Breaker", link: "/llm/traffic/05-circuit-breaker"},
                {text: "SSE 스트리밍", link: "/llm/traffic/06-sse-streaming"},
                {text: "Redis Streams", link: "/llm/traffic/07-redis-streams"},
                {text: "Celery 백그라운드", link: "/llm/traffic/08-celery"},
                {text: "Observability", link: "/llm/traffic/09-observability"},
              ],
            },
            // Level 2
            {
              text: "추론 성능 개선",
              collapsed: true,
              items: [
                // Level 3
                {text: "전체 개요", link: "/llm/inference-optimization/00-overview"},
                {text: "서빙 엔진 - vLLM", link: "/llm/inference-optimization/01-vllm"},
                {text: "양자화 - AWQ / GPTQ", link: "/llm/inference-optimization/02-quantization"},
                {text: "Context 최적화", link: "/llm/inference-optimization/03-context-optimization"},
                {text: "모델 라우팅", link: "/llm/inference-optimization/04-model-routing"},
                {text: "캐싱", link: "/llm/inference-optimization/05-caching"},
                {text: "인프라 최적화", link: "/llm/inference-optimization/06-infra"},
                {text: "메트릭 취합 및 성능 개선", link: "/llm/inference-optimization/07-metrics"},
                {text: "LMCache + Redis", link: "/llm/inference-optimization/08-lmcache-redis"},
              ],
            },
            // Level 2
            {
              text: "서빙 도구 비교",
              collapsed: true,
              items: [
                // Level 3
                {text: "vLLM", link: "/llm/inference-optimization/serving-tools/tool-vllm"},
                {text: "TensorRT-LLM", link: "/llm/inference-optimization/serving-tools/tool-tensorrt-llm"},
                {text: "Triton Inference Server", link: "/llm/inference-optimization/serving-tools/tool-triton"},
                {text: "AWQ 연계", link: "/llm/inference-optimization/serving-tools/tool-awq-integration"},
                {text: "도구 비교", link: "/llm/inference-optimization/serving-tools/tool-comparison"},
              ],
            },
            // Level 2
            {
              text: "EKS GPU 서빙 실습",
              collapsed: true,
              items: [
                // Level 3
                {text: "프로젝트 개요", link: "/llm/inference-optimization/llm-serve/00-overview"},
                {text: "EKS 인프라 구성", link: "/llm/inference-optimization/llm-serve/01-eks-infra"},
                {text: "Option A — vLLM", link: "/llm/inference-optimization/llm-serve/02-option-a-vllm"},
                {text: "Option B — TensorRT-LLM", link: "/llm/inference-optimization/llm-serve/03-option-b-trtllm"},
                {text: "Option C — Triton", link: "/llm/inference-optimization/llm-serve/04-option-c-triton"},
                {text: "Option D — Stable Diffusion", link: "/llm/inference-optimization/llm-serve/05-option-d-sd"},
                {text: "트러블슈팅 모음", link: "/llm/inference-optimization/llm-serve/07-troubleshooting"},
              ],
            },
          ],
        },
      ],
    },
  },
});
