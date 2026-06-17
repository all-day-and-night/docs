# 광고 최적화 플랫폼(MOP) Agent

::: info 프로젝트 개요
- **기간**: 2026.01 ~ 2026.02 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS
- **연관**: [MOP 인프라 (2023)](./01-mop-eks) — 동일 플랫폼 AI Agent 고도화
:::

---

## 배경 및 목적

LG CNS 광고 최적화 플랫폼(MOP)에 **AI Agent를 추가**하는 프로젝트.  
Amazon 광고 플랫폼을 사용하는 고객의 광고 실적 데이터를 분석하고,  
LangChain **DeepAgent** 라이브러리 기반으로 **자동화된 광고 성과 분석 리포트**를 생성한다.

---

## 아키텍처

```
광고주 (API 호출)
    ↓
FastAPI (분석 요청 수신)
    ↓
LangChain DeepAgent (분석 계획 수립 및 Tool 호출)
    ├→ get_campaign_performance → Amazon Ads API
    ├→ analyze_acos → MOP Database (캠페인/소재 데이터)
    └→ generate_report
        → 최종 리포트 반환
```

---

## 주요 구현

### LangChain DeepAgent 기반 Agent 구성

```python
from langchain_deepagent import DeepAgent
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", temperature=0)

agent = DeepAgent(
    llm=llm,
    tools=[
        get_campaign_performance,
        analyze_acos,
        generate_report,
    ],
    system_prompt="""
    당신은 Amazon 광고 최적화 플랫폼의 성과 분석 AI입니다.
    광고주의 요청에 따라 캠페인 데이터를 수집하고 분석하여
    실행 가능한 인사이트와 리포트를 제공하세요.
    반드시 get_campaign_performance → analyze_acos → generate_report 순서로 실행하세요.
    """,
    max_iterations=10,
)
```

### Amazon Ads API 연동 Tool

```python
@tool
def get_campaign_performance(campaign_id: str, date_range: str) -> dict:
    """Amazon 광고 캠페인의 실적 데이터를 조회합니다."""
    response = amazon_ads_client.get_report(
        campaign_id=campaign_id,
        metrics=["impressions", "clicks", "spend", "sales", "acos"],
        date_range=date_range
    )
    return response.data
```

### 고객 광고 실적 분석

- **ACOS(광고비용/매출) 분석**: 목표 ACOS 대비 현재 상태 평가
- **소재별 성과 비교**: CTR, CVR 기준 상위/하위 소재 자동 식별
- **예산 효율화 제안**: 성과 낮은 캠페인 예산 재배분 인사이트 생성

---

## 문제 해결 사례

**문제 1: Agent가 동일 Tool을 반복 호출하며 루프**

- 원인: Tool 호출 결과가 Agent 컨텍스트에 충분히 반영되지 않아 재확인 루프 발생
- 해결: `max_iterations` 제한 설정 + Tool 호출 결과를 메모리에 캐싱하여 중복 호출 방지
- 결과: 루프 발생 0건

**문제 2: Amazon Ads API Rate Limit 초과**

- 원인: 여러 캠페인 동시 분석 요청 시 API 호출 집중
- 해결: `asyncio.Semaphore`로 동시 호출 수 제한 + Exponential Backoff 재시도
- 결과: Rate Limit 오류 0건

**문제 3: Tool 호출 순서 오류**

- 원인: Tool 설명(docstring)이 불명확하여 Agent가 순서를 잘못 판단
- 해결: 각 Tool의 docstring에 선행 조건 명시 + System Prompt에 실행 순서 가이드 추가
- 결과: Tool 호출 순서 오류 0건

---

## LangChain AgentExecutor vs DeepAgent

| 항목 | AgentExecutor | DeepAgent |
|------|--------------|-----------|
| 구조 | ReAct 루프 기반 | 심층 추론 + 계획 수립 후 실행 |
| Tool 선택 | 매 스텝 즉시 판단 | 전체 계획을 먼저 수립 후 순차 실행 |
| 복잡한 분석 | 중간 실수 많음 | 단계별 계획으로 오류 감소 |
| 디버깅 | verbose 로그 | 계획 단계가 명시적으로 출력 |
| 적합한 경우 | 단순 Tool 호출 | 다단계 분석 / 리포트 생성 |

---

## 핵심 학습

- **DeepAgent 계획 수립 방식**: 즉흥적 Tool 호출이 아닌 전체 분석 계획을 먼저 수립하고 실행
- **Tool docstring의 중요성**: Agent는 docstring만으로 Tool을 선택하므로 선행 조건 / 입출력 형식을 명확히 작성해야 함
- **Rate Limit 방어**: 외부 API 연동 시 Semaphore + Backoff 패턴은 필수
- **`max_iterations` 설정**: Agent 무한 루프 방지를 위한 안전장치 — 프로덕션에서 반드시 설정
