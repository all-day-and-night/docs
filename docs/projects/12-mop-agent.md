# 광고 최적화 플랫폼(MOP) Agent

::: info 프로젝트 개요
- **기간**: 2026.01 ~ 2026.02 (2개월)
- **역할**: Backend Developer (데이터 서치 & 리포트 생성 Sub-Agent 담당)
- **소속**: LG CNS
- **연관**: [MOP 인프라 (2023)](./02-mop-eks) — 동일 플랫폼 AI Agent 고도화
:::

---

## 배경 및 목적

LG CNS Optapex 광고 전문가 대행 서비스에 Multi-Agent 시스템을 구축하는 팀 프로젝트.  
**사용 가이드 문의 대응 → 실적 분석 → 원인 파악 → 개선안 제시**의 전 과정을 AI Agent로 대체하는 것이 목표였다.

---

## 아키텍처

```
사용자 (자연어 질의)
    ↓
Super Agent (의도 파악 & Sub-Agent 라우팅)
    ├→ Sub-Agent 1: 사용 가이드 문의 대응 (RAG Tool)
    ├→ Sub-Agent 2: 데이터 서치 & 리포트 생성  ← 담당
    │       ↓ 자연어 → 동적 쿼리 선택 & 호출
    │       ↓ 데이터 조회 결과 → 차트 & 리포트 생성
    │       ↓ 조건 불명확 시 Human-in-the-loop 재질의
    │       ↓ 원인 분석용 데이터 → Sub-Agent 3에 전달
    └→ Sub-Agent 3: 원인 분석 & 개선안 제시
```

---

## 담당 구현: 데이터 서치 & 리포트 생성 Sub-Agent

### 역할 정의

실제 고객 대응 담당자를 인터뷰하여 Agent의 페르소나와 동작 범위를 설정했다.  
Optapex 백엔드 소스를 분석해 사용자의 자연어 질의를 받아 **적절한 데이터 조회 쿼리를 동적으로 선택·호출**하고, 결과를 분석해 차트와 리포트를 생성하는 흐름으로 구현했다.

### DeepAgent 기반 동적 Tool 호출

```python
from langchain_deepagent import DeepAgent
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", temperature=0)

agent = DeepAgent(
    llm=llm,
    tools=[
        query_campaign_performance,
        query_keyword_stats,
        query_budget_usage,
        generate_chart,
        generate_report,
        ask_human,                # Human-in-the-loop
        export_for_cause_agent,   # Sub-Agent 3 전달용 (Middleware 경유)
    ],
    skills=SKILL_REGISTRY,        # 사전 정의된 Skill 등록
    system_prompt=SYSTEM_PROMPT,
)
```

### Sub-Agent 간 데이터 전달: Middleware 방식

초기에는 Sub-Agent가 데이터를 `<tag>` 형태로 감싸 Super Agent에 반환하고, Super Agent가 이를 파싱해 다음 Sub-Agent에 전달하는 방식을 사용했다.

```
# 초기 방식 — <tag> 반환
Sub-Agent 2 → "<cause_data>{"acos": 0.45, ...}</cause_data>" → Super Agent → Sub-Agent 3
```

이 방식은 Super Agent의 컨텍스트가 불필요하게 커지고, 태그 파싱 로직이 Prompt에 의존한다는 문제가 있었다.  
**DeepAgent의 Middleware 파이프라인**을 활용하는 방식으로 전환했다.

```typescript
const agent = createAgent({
  model,
  tools: [search],
  middleware: [
    createFilesystemMiddleware({ backend }),       // 대화 상태 & 데이터 영속화
    createSummarizationMiddleware({ model, backend }),  // 컨텍스트 요약으로 토큰 절감
    createSkillsMiddleware({ backend, sources: ["./skills/"] }),  // Skill 로드
  ],
});
```

- `createFilesystemMiddleware`: Agent 상태와 Sub-Agent 간 전달 데이터를 Filesystem에 영속화 — Super Agent 컨텍스트를 거치지 않고 직접 공유
- `createSummarizationMiddleware`: 대화가 길어질수록 컨텍스트를 자동 요약하여 토큰 사용 절감
- `createSkillsMiddleware`: `./skills/` 디렉토리의 Skill 정의를 로드하여 Agent가 선택 가능한 워크플로우로 등록
- `<tag>` 파싱 Prompt 의존성 제거 → 동작 예측 가능성 향상

### Tool 설계 원칙: description으로 LLM 판단 유도

LLM이 Tool을 올바르게 선택하도록 `@tool(description="...")` 데코레이터에 용도와 호출 조건을 명확히 기술했다.  
Tool 내부에서는 LLM을 호출하지 않고, 판단은 모두 Agent(LLM)에게 위임했다.

```python
@tool(description="캠페인 실적 데이터를 조회합니다. 특정 기간의 광고 성과를 확인할 때 사용하세요.")
def query_campaign_performance(
    campaign_id: str,
    start_date: str,
    end_date: str,
    metrics: list[str],
) -> dict:
    return optapex_db.query_campaign(campaign_id, start_date, end_date, metrics)

@tool(description="조회 조건이 불명확하여 사용자에게 추가 확인이 필요할 때 사용하세요.")
def ask_human(question: str) -> str:
    return input(f"[추가 확인 필요] {question}\n> ")
```

### Skill 기반 워크플로우 제어

특정 흐름이 필요한 경우에만 Skill을 Agent가 선택해 실행하도록 설계했다.  
Claude Code의 slash command skill 정의나 CLAUDE.md harness 방식과 유사하게, **`./skills/` 디렉토리 하위에 Skill을 파일로 정의**하고 `createSkillsMiddleware`가 이를 읽어 Agent에 등록한다.

```
skills/
├── monthly-report.md    # 월간 리포트 생성 흐름 정의
├── quick-lookup.md      # 단순 데이터 조회 흐름 정의
└── cause-analysis.md    # 원인 분석 데이터 준비 흐름 정의
```

Agent는 사용자 질의에 따라 해당 Skill 파일의 지침을 읽고 흐름을 수행한다.  
전체를 workflow로 고정하지 않고 Skill을 선택 가능한 옵션으로 두어, 단순 질의에는 Skill 없이 Tool만 동적으로 호출하고 복잡한 흐름에만 Skill을 활용하는 유연성을 확보했다.

---

## 설계 방향 전환: Workflow → Agentic

### 문제 제기

초기 팀의 설계는 **workflow 기반**이었다. Tool이 고정된 순서대로만 호출되어 다음과 같은 문제가 발생했다.

- 단순 조회 질문에도 불필요한 데이터를 항상 조회
- 리포트가 필요 없는 상황에서도 긴 리포트를 출력한 뒤에야 다음 단계로 진행
- 사용자 질의 유형과 무관하게 동일한 흐름만 반복

"현재 방식이 너무 workflow에 종속된 것 같다"는 의문을 팀에 제기했고, 팀 전체가 개발 방법론을 재검토하는 논의로 이어졌다.

### 팀 합의 설계 원칙 (5가지)

각자가 방법을 조사해 공유한 뒤 논의를 통해 합의한 원칙으로, 어느 한 사람의 결정이 아닌 팀 전체의 의견을 모은 결과였다.

| # | 원칙 | 이유 |
|---|------|------|
| 1 | LangChain DeepAgent 기반으로 전환 — Agent가 스스로 동작 계획 수립 | workflow 종속 탈피, 유연한 Tool 호출 |
| 2 | 특정 workflow는 Skill로 사전 정의, Agent가 선택하여 실행 | 필요한 경우에만 고정 흐름 적용 |
| 3 | Tool의 args에 type hint와 description을 명확히 정의 | LLM이 판단해 Tool을 동적으로 선택 |
| 4 | Tool 내부에서 LLM 호출 지양 (Super·Sub Agent만 LLM 사용) | Prompt·Skill 관리 일관성 유지 |
| 5 | Agent 분기 처리에 State 사용 금지 | 동작 예측 가능성 확보 |

### 검증 및 공유

원칙을 데이터 서치 Sub-Agent에 먼저 적용해 효과를 확인했다.

- 사용자 질의에 따라 Tool이 동적으로 호출되는 Agentic 동작 구현
- Tool 내 LLM 호출 제거로 동작 흐름이 예측 가능해짐

검증 결과를 팀에 공유하면서 원칙의 실효성을 함께 확인하는 선순환이 만들어졌다.

---

## 팀 내 기술 의견 교환

LangChain이 비교적 최신 기술이라 팀 내 명확한 표준이 없었고, 서로의 코드를 리뷰하기 어려운 상황이었다.

- **제안 → 반영**: 다른 팀원이 개발한 RAG 조회 기능을 Sub-Agent 대신 Tool로 구성해 추가 LLM 호출을 줄이자고 제안하여 반영됨
- **수용 → 개선**: Tool 내 Structured Output으로 처리하던 부분을 "args type hint와 description으로 제어하자"는 팀원 의견을 받아 수정, 불필요한 LLM 호출 제거

---

## 핵심 학습

- **Agentic vs Workflow**: 고정 흐름은 예측 가능하지만 경직됨 — Agent가 계획을 수립하고 Skill로 필요한 경우만 고정 흐름을 적용하는 하이브리드 설계가 효과적
- **Tool 설계가 Agent 품질을 결정**: args description과 type hint가 명확할수록 LLM의 Tool 선택 정확도가 높아짐
- **Tool 내 LLM 최소화**: LLM 호출 지점을 Agent로 집중시키면 Prompt 관리와 동작 추적이 단순해짐
- **Human-in-the-loop**: 조건 불명확 시 무조건 추론하지 않고 사용자에게 재질의하는 것이 데이터 정확도에 효과적
- **Agent 간 데이터 전달은 Middleware로**: `<tag>` 반환 방식은 Super Agent 컨텍스트를 오염시키고 Prompt 의존성을 높임 — `createFilesystemMiddleware`로 데이터를 영속화하면 컨텍스트와 데이터를 분리할 수 있음
