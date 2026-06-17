# 프로젝트 전체 인덱스

LG CNS 재직 기간(2022.07 ~ 현재) 동안 수행한 프로젝트 목록

---

## 타임라인

```
2022.10 ──── 차세대 사회보장 행복e음 (Spring Batch)
2023.07 ──── LG CNS 광고 최적화 플랫폼 MOP (AWS EKS / Cloud)
2024.03 ──── LG 전자 임직원 모니터 신청 (Fullstack)
2024.05 ──── 미래엔 AI 디지털 교과서 (Frontend)
2024.11 ──┬─ LG 전자 사용자 메뉴얼 생성 (Python / pptx)
           └─ LG 디스플레이 뉴스 기반 기업 분석 (FastAPI)
2025.01 ──── LG 디스플레이 메일 AI Agent (Java / LLM)
2025.06 ──── DnO 생성형 AI Agent (RAG / Bedrock)
2025.09 ──── 신한카드 여행 앱 PoC (Strands Agent)
2025.10 ──── KDB 생명 Agentic AI Prototype
2025.12 ──── 스타벅스 BI Report Agent PoC (Text-to-SQL)
2026.01 ──── 광고 최적화 플랫폼(MOP) Agent (LangChain DeepAgent)
2026.04 ──── NH농협손해보험 Frontend Vue 전환 (Vue 3 / Claude Harness)
진행중  ──── AWS EKS + LLM 인프라 실습
```

---

## 프로젝트 목록

| # | 프로젝트 | 기간 | 역할 | 핵심 기술 |
|---|---------|------|------|----------|
| 01 | [차세대 사회보장 행복e음](./02-happy-eeum) | 2022.10~2023.02 | BE | Spring Batch, Oracle |
| 02 | [LG CNS MOP (AWS EKS)](./01-mop-eks) | 2023.07~2024.02 | Cloud Engineer | Terraform, EKS, SageMaker |
| 03 | [LGE 모니터 신청](./07-lge-monitor) | 2024.03~2024.05 | Fullstack | Spring Boot, React, MySQL |
| 04 | [미래엔 AI 교과서](./06-mirae-n) | 2024.05~2024.10 | FE | React, TypeScript |
| 05 | [LGD 뉴스 기업 분석](./04-lgd-news-analysis) | 2024.11~2024.12 | BE | Python, FastAPI, Docker |
| 06 | [LGE 메뉴얼 생성](./05-lge-manual) | 2024.11~2024.12 | BE | Python, FastAPI, python-pptx |
| 07 | [LGD 메일 AI Agent](./03-lgd-mail-agent) | 2025.01~2025.06 | BE / Architect | Java, Spring, Llama, Exaone |
| 08 | [DnO AI Agent](./08-dno-agent) | 2025.06~2025.07 | BE | Bedrock, OpenSearch, RAG |
| 09 | [신한카드 여행 앱](./10-shinhan-travel) | 2025.09~2025.10 | BE | Strands Agents, Knowledge Base |
| 10 | [KDB 생명 Agentic AI](./09-kdb-life) | 2025.10~2025.11 | BE | AWS Bedrock, FastAPI |
| 11 | [스타벅스 BI Report Agent](./11-starbucks-bi) | 2025.12 | PM / BE | Bedrock, Text-to-SQL |
| 12 | [MOP Agent (DeepAgent)](./12-mop-agent) | 2026.01~2026.02 | BE | LangChain, DeepAgent, FastAPI |
| 13 | [NH농협손해보험 Frontend Vue 전환](./14-nhfire-frontend) | 2026.04~ | FE | Vue 3, Vite, Capacitor, Claude Harness |
| 14 | [AWS EKS LLM 인프라 실습](./13-eks-llm-infra) | 2026.06~ | 개인 실습 | EKS, vLLM, Terraform |

---

## 기술 키워드 맵

- **Cloud / IaC**: `EKS` `SageMaker` `Lambda` `Bedrock` `Terraform` `Route 53` `CloudFront`
- **AI / LLM**: `LangChain` `LangChain DeepAgent` `Strands Agents` `RAG` `OpenSearch` `Llama` `Exaone` `vLLM`
- **Backend**: `Spring Boot` `FastAPI` `Java` `Python`
- **Frontend**: `Vue 3` `TypeScript` `Vite` `Pinia` `TanStack Query` `Tailwind CSS` `Capacitor`
- **DevOps**: `GitLab` `CI/CD` `Jenkins` `Turborepo` `pnpm`
- **성능 개선**: `비동기` `멀티스레드` `캐시` `Spring Batch` `SQL 튜닝` `Dask`
