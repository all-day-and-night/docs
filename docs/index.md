---
layout: home

hero:
  name: "주원웅"
  text: "Platform Engineer & AI Developer"
  tagline: "LG CNS 플랫폼엔지니어링팀 · AWS Cloud / LLM / Backend · 2022.07 ~ "
  actions:
    - theme: brand
      text: 프로젝트 이력 보기
      link: /llm/projects/
    - theme: alt
      text: 실습 계획 보기
      link: /llm/

features:
  - icon: 📂
    title: 프로젝트 이력
    details: LG CNS 재직 중 수행한 14개 실무 프로젝트 — AI Agent, Cloud Infra, Frontend 전환까지
    link: /llm/projects/
    linkText: 이력 보기

  - icon: 🏗️
    title: AWS 인프라 구축
    details: Terraform IaC로 VPC · GitLab EC2 · EKS 클러스터 구성부터 CI/CD 파이프라인 연동까지
    link: /llm/aws-infra/00-overview
    linkText: 가이드 보기

  - icon: ⚡
    title: 대규모 트래픽 처리
    details: Redis 캐시 · Rate Limiting · Circuit Breaker · SSE 스트리밍 · Celery · Observability
    link: /llm/traffic/00-overview
    linkText: 전략 보기

  - icon: 🚀
    title: 추론 성능 개선
    details: vLLM · 양자화(AWQ/GPTQ) · KV Cache · 모델 라우팅 · TensorRT-LLM / Triton 서빙 도구 비교
    link: /llm/inference-optimization/00-overview
    linkText: 최적화 보기

  - icon: 🖥️
    title: EKS GPU 서빙 실습
    details: EKS g5.12xlarge (A10G × 4) 위에서 vLLM · TensorRT-LLM · Triton · Stable Diffusion 실제 배포 및 API 테스트
    link: /llm/inference-optimization/llm-serve/00-overview
    linkText: 실습 보기

  - icon: 📋
    title: 실습 계획 & 현황
    details: AI Inference Platform 단계별 구축 계획과 현재 진행 상황 추적
    link: /llm/progress
    linkText: 현황 보기
---

<div class="home-content">

## 소개

LG CNS 플랫폼엔지니어링팀에서 **AI/LLM 서비스 개발과 AWS 클라우드 인프라 구축**을 담당하고 있습니다.

LLM Agent · RAG · Bedrock 기반 AI 서비스부터 Terraform EKS 인프라, FastAPI/Spring Boot 백엔드, React/Vue 3 프론트엔드까지 **풀스택 + 클라우드 엔지니어**로 활동하고 있습니다.

github 주소: https://github.com/all-day-and-night

## 기술 스택

<div class="tech-section">
  <div class="tech-group">
    <span class="tech-label">AI / LLM</span>
    <div class="tech-badges">
      <span class="tech-badge">LangChain</span><span class="tech-badge">DeepAgent</span><span class="tech-badge">Strands Agents</span><span class="tech-badge">RAG</span><span class="tech-badge">OpenSearch</span><span class="tech-badge">Llama</span><span class="tech-badge">Exaone</span><span class="tech-badge">vLLM</span><span class="tech-badge">Bedrock</span>
    </div>
  </div>
  <div class="tech-group">
    <span class="tech-label">Cloud / IaC</span>
    <div class="tech-badges">
      <span class="tech-badge">AWS EKS</span><span class="tech-badge">SageMaker</span><span class="tech-badge">Lambda</span><span class="tech-badge">Terraform</span><span class="tech-badge">Route 53</span><span class="tech-badge">CloudFront</span><span class="tech-badge">ECR</span>
    </div>
  </div>
  <div class="tech-group">
    <span class="tech-label">Backend</span>
    <div class="tech-badges">
      <span class="tech-badge">Spring Boot</span><span class="tech-badge">FastAPI</span><span class="tech-badge">Java</span><span class="tech-badge">Python</span><span class="tech-badge">Spring Batch</span>
    </div>
  </div>
  <div class="tech-group">
    <span class="tech-label">Frontend</span>
    <div class="tech-badges">
      <span class="tech-badge">Vue 3</span><span class="tech-badge">React</span><span class="tech-badge">TypeScript</span><span class="tech-badge">Vite</span><span class="tech-badge">Pinia</span><span class="tech-badge">Tailwind</span><span class="tech-badge">Capacitor</span>
    </div>
  </div>
  <div class="tech-group">
    <span class="tech-label">DevOps</span>
    <div class="tech-badges">
      <span class="tech-badge">GitLab CI/CD</span><span class="tech-badge">Jenkins</span><span class="tech-badge">Docker</span><span class="tech-badge">Kubernetes</span><span class="tech-badge">Turborepo</span><span class="tech-badge">pnpm</span>
    </div>
  </div>
  <div class="tech-group">
    <span class="tech-label">성능 / 관측</span>
    <div class="tech-badges">
      <span class="tech-badge">Prometheus</span><span class="tech-badge">Grafana</span><span class="tech-badge">Redis</span><span class="tech-badge">Locust</span><span class="tech-badge">비동기 처리</span><span class="tech-badge">SQL 튜닝</span>
    </div>
  </div>
</div>

## EKS GPU 서빙 실습 (llm-serve)

<div class="eks-highlight">
  <div class="eks-infra">
    <div class="eks-badge">g5.12xlarge · A10G × 4 · 96GB VRAM</div>
    <div class="eks-options">
      <a href="/llm/inference-optimization/llm-serve/02-option-a-vllm" class="eks-option">
        <span class="eks-option-label">Option A</span>
        <strong>vLLM</strong>
        <span>Qwen2.5-7B · TP=2 · OpenAI 호환</span>
      </a>
      <a href="/llm/inference-optimization/llm-serve/03-option-b-trtllm" class="eks-option">
        <span class="eks-option-label">Option B</span>
        <strong>TensorRT-LLM</strong>
        <span>tp_size=2 · 성능 최적화</span>
      </a>
      <a href="/llm/inference-optimization/llm-serve/04-option-c-triton" class="eks-option">
        <span class="eks-option-label">Option C</span>
        <strong>Triton</strong>
        <span>KServe V2 · 엔터프라이즈</span>
      </a>
      <a href="/llm/inference-optimization/llm-serve/05-option-d-sd" class="eks-option">
        <span class="eks-option-label">Option D</span>
        <strong>Stable Diffusion</strong>
        <span>SDXL 1.0 · txt2img API</span>
      </a>
    </div>
    <a href="/llm/inference-optimization/llm-serve/00-overview" class="project-link" style="margin-top:0.75rem;display:inline-block;">전체 실습 보기 →</a>
  </div>
</div>

## 주요 프로젝트

<div class="project-grid">
  <div class="project-card">
    <div class="project-header">
      <strong>LGD 메일 AI Agent</strong>
      <span class="period">2025.01 ~ 2025.06</span>
    </div>
    <div class="tech-badges sm">
      <span class="tech-badge">Java</span><span class="tech-badge">Spring</span><span class="tech-badge">Llama 3</span><span class="tech-badge">Exaone</span>
    </div>
    <p>LG 디스플레이 사내 메일에 LLM 기반 기능(요약 · 초안 · 멀티턴 대화) 추가. 아키텍처 설계부터 비동기 구현, 부하 테스트까지 2인 전담.</p>
    <a href="/llm/projects/03-lgd-mail-agent" class="project-link">자세히 보기 →</a>
  </div>

  <div class="project-card">
    <div class="project-header">
      <strong>LG CNS MOP AWS 인프라</strong>
      <span class="period">2023.07 ~ 2024.02</span>
    </div>
    <div class="tech-badges sm">
      <span class="tech-badge">Terraform</span><span class="tech-badge">EKS</span><span class="tech-badge">SageMaker</span><span class="tech-badge">Dask</span>
    </div>
    <p>ML 학습/추론 파이프라인 AWS 자동화. Terraform IaC + SageMaker Training + EKS Batch Pod 전 과정 구축.</p>
    <a href="/llm/projects/01-mop-eks" class="project-link">자세히 보기 →</a>
  </div>

  <div class="project-card">
    <div class="project-header">
      <strong>DnO 생성형 AI Agent</strong>
      <span class="period">2025.06 ~ 2025.07</span>
    </div>
    <div class="tech-badges sm">
      <span class="tech-badge">AWS Bedrock</span><span class="tech-badge">OpenSearch</span><span class="tech-badge">RAG</span>
    </div>
    <p>Bedrock + OpenSearch 기반 RAG 아키텍처로 생성형 AI Agent 구축.</p>
    <a href="/llm/projects/08-dno-agent" class="project-link">자세히 보기 →</a>
  </div>

  <div class="project-card">
    <div class="project-header">
      <strong>MOP Agent (DeepAgent)</strong>
      <span class="period">2026.01 ~ 2026.02</span>
    </div>
    <div class="tech-badges sm">
      <span class="tech-badge">LangChain</span><span class="tech-badge">DeepAgent</span><span class="tech-badge">FastAPI</span>
    </div>
    <p>광고 최적화 플랫폼에 LangChain DeepAgent 연동한 AI 고도화.</p>
    <a href="/llm/projects/12-mop-agent" class="project-link">자세히 보기 →</a>
  </div>

  <div class="project-card">
    <div class="project-header">
      <strong>NH농협손해보험 FE Vue 전환</strong>
      <span class="period">2026.04 ~</span>
    </div>
    <div class="tech-badges sm">
      <span class="tech-badge">Vue 3</span><span class="tech-badge">Vite</span><span class="tech-badge">Capacitor</span>
    </div>
    <p>레거시 프론트엔드를 Vue 3 기반으로 전환, Claude Harness를 활용한 AI 보조 개발 적용.</p>
    <a href="/llm/projects/14-nhfire-frontend" class="project-link">자세히 보기 →</a>
  </div>

  <div class="project-card">
    <div class="project-header">
      <strong>AWS EKS LLM 인프라 실습</strong>
      <span class="period">2026.06 ~ 진행 중</span>
    </div>
    <div class="tech-badges sm">
      <span class="tech-badge">EKS</span><span class="tech-badge">vLLM</span><span class="tech-badge">Terraform</span><span class="tech-badge">GitLab CI</span>
    </div>
    <p>개인 실습용 AI Inference Platform 구축 — EKS 클러스터부터 LLM 서빙, 트래픽 처리까지.</p>
    <a href="/llm/projects/13-eks-llm-infra" class="project-link">자세히 보기 →</a>
  </div>
</div>

</div>

<style>
.home-content {
  max-width: 1020px;
  margin: 0 auto;
  padding: 3rem 2rem 5rem;
}

.home-content h2 {
  font-size: 1.4rem;
  font-weight: 600;
  margin-top: 3rem;
  margin-bottom: 1.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.home-content p {
  line-height: 1.8;
  color: var(--vp-c-text-2);
}

/* 기술 스택 섹션 */
.tech-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tech-group {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.tech-label {
  flex-shrink: 0;
  width: 100px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding-top: 3px;
}

.tech-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 프로젝트 그리드 */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 1.25rem;
  margin-top: 1.25rem;
}

.project-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 1.25rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: var(--vp-c-bg-soft);
}

.project-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 16px rgba(100, 108, 255, 0.1);
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}

.project-card strong {
  font-size: 0.95rem;
  color: var(--vp-c-text-1);
}

.project-card p {
  font-size: 0.88rem;
  line-height: 1.65;
  color: var(--vp-c-text-2);
  margin: 0.6rem 0;
}

.project-link {
  font-size: 0.82rem;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.project-link:hover {
  text-decoration: underline;
}

/* EKS GPU 서빙 실습 하이라이트 */
.eks-highlight {
  margin-top: 1.25rem;
}

.eks-infra {
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  background: var(--vp-c-bg-soft);
}

.eks-badge {
  display: inline-block;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  margin-bottom: 1rem;
}

.eks-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.eks-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  background: var(--vp-c-bg);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.eks-option:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 8px rgba(100, 108, 255, 0.1);
}

.eks-option-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.eks-option strong {
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
}

.eks-option span:last-child {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}
</style>
