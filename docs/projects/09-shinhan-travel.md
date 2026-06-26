# 신한카드 여행 앱 PoC

::: info 프로젝트 개요
- **기간**: 2025.09 ~ 2025.10 (2개월)
- **역할**: Fullstack Developer (Frontend + Backend)
- **소속**: LG CNS → 신한카드 (고객사)
- **형태**: PoC (Proof of Concept)
:::

---

## 배경 및 목적

신한카드 여행 앱에서 사용자의 데이터와 카드 혜택을 연계하여 **맞춤형 여행 경험**을 제공하는 AI Agent PoC.  
AWS Strands Agents 프레임워크를 활용해 아래 세 가지 핵심 기능을 구현했다.

1. **맞춤 여행지 추천** — 사용자의 카드 사용 이력·선호 데이터를 분석해 최적의 여행지 제안
2. **혜택 기반 카드 추천** — 목적지와 여행 유형에 맞는 최적 카드 추천
3. **여행 비용·할인 금액 제시** — 추천 카드 사용 시 실제 적용되는 혜택과 예상 절감 금액 계산

---

## 아키텍처

```
[React Frontend]
    ↓ REST API
[API Gateway]
    ↓
[AWS Lambda (Strands Agent 실행)]
    → Strands Agent (여행 플래너)
        → 사용자 데이터 조회 Tool  ──→ DynamoDB (사용자 프로필 / 카드 사용 이력)
        → 혜택 검색 Tool           ──→ AWS Knowledge Base (카드 혜택 문서)
                                           ← S3 (원본 혜택 데이터)
                                           ← Bedrock (임베딩 + 생성)
        → 비용 계산 Tool           ──→ DynamoDB (여행지 비용 데이터)
    ↓
추천 여행지 + 추천 카드 + 예상 할인 금액 반환
```

---

## 주요 구현

### Strands Agent — 여행 추천 통합 처리

```python
from strands import Agent, tool
from strands_tools import retrieve
import boto3

dynamodb = boto3.resource("dynamodb")

@tool
def get_user_profile(user_id: str) -> dict:
    """사용자 카드 사용 이력 및 선호 데이터를 조회합니다."""
    table = dynamodb.Table("UserProfiles")
    return table.get_item(Key={"userId": user_id})["Item"]

@tool
def search_card_benefits(travel_type: str, destination: str) -> str:
    """여행 유형과 목적지에 맞는 카드 혜택을 검색합니다."""
    return knowledge_base.retrieve(
        query=f"{destination} 여행 {travel_type} 혜택",
        top_k=5
    )

@tool
def calculate_travel_discount(destination: str, card_id: str) -> dict:
    """해당 카드로 여행지 이용 시 예상 비용과 할인 금액을 계산합니다."""
    table = dynamodb.Table("TravelCosts")
    costs = table.get_item(Key={"destination": destination})["Item"]
    # 카드 혜택 적용 후 절감액 계산
    ...

agent = Agent(
    model="us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    tools=[get_user_profile, search_card_benefits, calculate_travel_discount],
    system_prompt="""
    당신은 신한카드 여행 전문 추천 AI입니다.
    반드시 아래 순서로 도구를 호출하세요:
    1. 사용자 프로필 조회로 선호 여행 패턴 파악
    2. 카드 혜택 검색으로 목적지별 최적 카드 선정
    3. 비용 계산으로 카드 사용 시 예상 할인 금액 제시
    추측 없이 반드시 도구 호출 결과만 사용하세요.
    """
)
```

### DynamoDB 테이블 구성

| 테이블 | 파티션 키 | 주요 데이터 |
|--------|-----------|-------------|
| `UserProfiles` | `userId` | 카드 사용 이력, 선호 카테고리, 방문 여행지 |
| `TravelCosts` | `destination` | 항공·숙박·식비 평균 비용, 카드별 할인율 |

### React Frontend

- 사용자 여행지·일정 입력 폼 → Lambda API 호출
- 추천 결과 카드 UI: 여행지 / 추천 카드 / 예상 할인 금액 표시
- 카드별 혜택 상세 모달

### AWS Lambda 서버리스 배포

- Cold Start 최소화를 위한 Lambda SnapStart 적용
- React 빌드 산출물은 S3 + CloudFront로 정적 호스팅

---

## 문제 해결 사례

**문제: Agent가 카드 혜택 데이터 없이 환각(Hallucination) 답변**

- 상황: Tool 호출 없이 LLM이 알고 있는 정보로 임의 추천
- 원인: System Prompt에 Tool 사용 강제 지시 미흡
- 해결: 도구 호출 순서를 명시적으로 지시 + Tool 호출 여부 검증 로직 추가
- 결과: KB 및 DynamoDB 기반 정확한 추천·할인 금액 계산 달성

---

## 핵심 학습

- **Strands Agents**: AWS가 제공하는 경량 Agent 프레임워크 — LangChain 대비 AWS 서비스 통합이 간편
- **DynamoDB 연동**: 사용자 프로필과 비용 데이터를 Agent Tool로 직접 조회하는 구조가 RAG보다 정형 데이터에 적합
- **Serverless Agent**: Lambda 기반 Agent는 콜드 스타트가 UX에 영향 — SnapStart/Provisioned Concurrency 고려 필요
- **Agent 신뢰성**: Tool 호출 순서와 강제 사용을 명시하지 않으면 환각 위험 — Guardrail 설계가 프로덕션 품질 결정
