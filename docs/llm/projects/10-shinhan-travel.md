# 신한카드 여행 앱 PoC

::: info 프로젝트 개요
- **기간**: 2025.09 ~ 2025.10 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → 신한카드 (고객사)
- **형태**: PoC (Proof of Concept)
:::

---

## 배경 및 목적

신한카드 여행 앱에서 사용자가 여행지와 일정을 입력하면 **적합한 카드 혜택을 추천**하는 AI Agent PoC.  
AWS Strands Agents 프레임워크를 활용해 빠르게 Agentic AI를 구현하고,  
카드 혜택 데이터를 RAG로 구축하여 정확한 혜택 정보를 기반으로 추천한다.

---

## 아키텍처

```
여행 앱 (여행지 / 일정 입력)
    ↓
AWS Lambda (Strands Agent 실행)
    → Strands Agent (여행 플래너)
        → 혜택 검색 Tool 호출
        → AWS Knowledge Base (카드 혜택 문서 인덱싱)
            ← S3 (카드 혜택 원본 데이터)
            ← AWS Bedrock (임베딩 + 생성)
    → 추천 카드 + 혜택 설명 반환
```

---

## 주요 구현

### Strands Agent 기반 여행 카드 추천

```python
from strands import Agent, tool
from strands_tools import retrieve

@tool
def search_card_benefits(travel_type: str, destination: str) -> str:
    """여행 유형과 목적지에 맞는 카드 혜택을 검색합니다."""
    return knowledge_base.retrieve(
        query=f"{destination} 여행 {travel_type} 혜택",
        top_k=5
    )

agent = Agent(
    model="us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    tools=[search_card_benefits],
    system_prompt="""
    당신은 신한카드 여행 전문 추천 AI입니다.
    사용자의 여행 계획에 맞는 최적의 카드 혜택을 추천하세요.
    반드시 카드 혜택 검색 도구를 사용하여 정확한 정보를 기반으로 추천하세요.
    """
)
```

### AWS Knowledge Base 구성 (카드 혜택 RAG)

- 신한카드 전 상품의 혜택 데이터를 S3에 저장
- AWS Knowledge Base로 자동 청킹 + 임베딩 + OpenSearch 저장
- Bedrock Retrieve API로 관련 혜택 검색

### AWS Lambda 서버리스 배포

- Cold Start 최소화를 위한 Lambda SnapStart 적용
- 여행 앱 API Gateway → Lambda 연동

---

## 문제 해결 사례

**문제: Agent가 카드 혜택 데이터 없이 환각(Hallucination) 답변**

- 상황: Tool 호출 없이 LLM이 알고 있는 정보로 임의 추천
- 원인: System Prompt에 Tool 사용 강제 지시 미흡
- 해결: "반드시 검색 도구를 사용하라"는 명시적 지시 + Tool 호출 검증 로직 추가
- 결과: 실제 KB 기반 정확한 혜택 추천 달성

---

## 핵심 학습

- **Strands Agents**: AWS가 제공하는 경량 Agent 프레임워크 — LangChain 대비 AWS 서비스 통합이 간편
- **AWS Knowledge Base**: RAG 인프라를 완전 관리형으로 제공 — 청킹/임베딩/인덱싱 자동화
- **Serverless Agent**: Lambda 기반 Agent는 콜드 스타트가 UX에 영향 — SnapStart/Provisioned Concurrency 고려 필요
- **Agent 신뢰성**: Tool 사용을 강제하지 않으면 환각 위험 — Guardrail 설계가 프로덕션 품질 결정
