# 스타벅스 BI Report Agent PoC

::: info 프로젝트 개요
- **기간**: 2025.12 (1개월)
- **역할**: PM + Backend Developer — 요구사항 분석·설계·업무 분배·스프린트 운영 및 핵심 모듈 개발 전담
- **소속**: LG CNS → 스타벅스 코리아 (고객사)
- **형태**: PoC (Proof of Concept)
:::

---

## 배경 및 목적

스타벅스 각 매장의 실적 데이터를 기반으로 **매주 매장별 BI 리포트를 자동 생성**하고,  
점주가 리포트를 바탕으로 자연어로 질의하면 **AI Agent가 데이터를 조회·답변**하는 PoC.

초기 분석·설계 단계부터 참여하여 클라이언트 요구사항을 수집하고,  
어떤 에이전트 구조가 필요한지 설계한 뒤 기능 검증 및 구현까지 전담했다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 주간 매장 리포트 생성 | 매주 전 매장의 실적 데이터를 배치로 집계·리포트 생성 및 제공 |
| 리포트 기반 질의·답변 | 점주가 자신의 리포트를 기반으로 자연어로 질문하면 AI가 답변 |
| Text-to-SQL 데이터 조회 | 리포트 범위를 벗어난 심층 질의는 SQL을 동적 생성하여 DW에서 직접 조회 |
| Mermaid 차트 시각화 | LLM이 데이터 분석 결과를 Mermaid 문법으로 출력, 프론트에서 차트로 렌더링 |

---

## 아키텍처

```
[배치 스케줄러 — 매주 실행]
    → 전 매장 주간 실적 집계
    → 리포트 데이터 생성 (LLM 요약 포함)
    → DB 저장 (사전 캐싱)

[점주 질의]
    ↓
[Agent 라우터]
    ├─ 리포트 범위 질의 ──→ DB 조회 (사전 생성된 리포트) → 답변
    └─ 심층 데이터 질의 ──→ Text-to-SQL Agent
                                → 스키마 로드
                                → SQL 생성 (Claude)
                                → SQL 유효성 검사 (위험 키워드 차단)
                                → SQL 실행 → Data Warehouse
                                → 결과 자연어 요약 → 답변
```

---

## 주요 구현

### Text-to-SQL Agent 워크플로

```python
SYSTEM_PROMPT = """
당신은 스타벅스 데이터 분석 AI입니다.
다음 테이블 스키마를 참고하여 사용자의 질문에 맞는 SQL을 생성하세요.

[스키마]
- store_sales: store_id, date, product_id, quantity, revenue
- stores: store_id, store_name, region
- products: product_id, product_name, category

규칙:
1. SELECT 쿼리만 생성 (INSERT, UPDATE, DELETE, DROP 금지)
2. 날짜 필터는 반드시 포함
3. 결과 컬럼에 한국어 별칭 사용
"""
```

### PM 역할 — 방향 설정 · 업무 분배 · 스프린트 운영

고객사 현업 인터뷰부터 PoC 완료까지 PM으로서 전체 방향을 설정하고 개발자들의 협업 구조를 설계했다.

**요구사항 분석 & 설계**
- 스타벅스 현업 담당자·점주 인터뷰를 통해 핵심 질의 유형 수집 및 우선순위 정의
- 인터뷰 결과를 바탕으로 3개 Agent 모듈(배치 리포트 / 리포트 Q&A / Text-to-SQL) 구조 설계
- 개발 범위, API 인터페이스, 데이터 흐름을 문서화하여 팀 내 공유

**주간 스프린트 운영**
- 1주 단위 스프린트로 목표를 명확히 정의하고, 인원별 담당 모듈 분배
- 스프린트 시작 시 목표·완료 기준 합의, 종료 시 데모·회고로 진행 상황 점검
- 병목 발생 시 우선순위 재조정 및 리소스 재배분


**핵심 개발 모듈 (직접 구현)**
- S3에 적재된 매장별 가데이터를 가공하여 DB로 이관하는 배치 파이프라인 구축(Text To SQL Agent 사용 table)
- 리포트 생성 배치 — 주간 실적 집계 후 LLM 요약 및 DB 사전 저장
- Text-to-SQL Agent — 스키마 동적 주입, SQL 생성, 유효성 검사, DW 조회 전 구현
- PoC 데모 시나리오 설계 및 Agent 응답 품질 검증

### Mermaid 기반 차트 시각화

점주의 질의에 대한 응답을 단순 텍스트가 아닌 **시각적 차트**로 제공하기 위해,  
LLM이 Mermaid 문법의 차트 코드를 직접 생성하고 프론트엔드에서 렌더링하는 방식을 구현했다.

#### 프롬프트 설계 — LLM이 Mermaid 코드를 출력하도록 유도

```python
CHART_SYSTEM_PROMPT = """
당신은 스타벅스 매장 데이터를 시각화하는 AI입니다.
데이터를 분석한 뒤, 반드시 아래 JSON 형식으로만 응답하세요.

{
  "summary": "한 줄 요약 텍스트",
  "chart_type": "bar | line | pie | xychart",
  "mermaid_code": "mermaid 코드 블록 (xychart-beta 또는 pie 문법)"
}

규칙:
1. mermaid_code는 반드시 유효한 Mermaid 문법으로 작성
2. xychart-beta: 매출·판매량 추이 등 시계열/비교 데이터
3. pie: 카테고리 비율 데이터
4. 데이터 값은 실제 조회 결과만 사용 (임의 값 금지)
5. 한국어 레이블 사용
"""
```

#### Structured Output으로 Mermaid 코드 안전하게 추출

```python
from pydantic import BaseModel
from anthropic import Anthropic

class ChartResponse(BaseModel):
    summary: str
    chart_type: str          # bar | line | pie | xychart
    mermaid_code: str        # Mermaid 문법 코드

client = Anthropic()

def generate_chart(query: str, sql_result: list[dict]) -> ChartResponse:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=CHART_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"질의: {query}\n\n데이터: {sql_result}"
        }]
    )
    return ChartResponse.model_validate_json(response.content[0].text)
```

**예시 — 주간 매출 추이 질의 시 LLM 출력:**

```json
{
  "summary": "최근 4주간 강남점 매출은 꾸준히 증가하는 추세입니다.",
  "chart_type": "xychart",
  "mermaid_code": "xychart-beta\n  title \"강남점 주간 매출 추이\"\n  x-axis [\"5월 1주\", \"5월 2주\", \"5월 3주\", \"5월 4주\"]\n  y-axis \"매출(만원)\" 0 --> 500\n  bar [320, 345, 390, 420]"
}
```

#### 프론트엔드 렌더링 — mermaid.js

```typescript
import mermaid from 'mermaid';
import { useEffect, useRef } from 'react';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

interface ChartProps {
  mermaidCode: string;
  summary: string;
}

export function MermaidChart({ mermaidCode, summary }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // 매 렌더마다 고유 id로 mermaid 재파싱 (캐싱 충돌 방지)
    const id = `chart-${Date.now()}`;
    mermaid.render(id, mermaidCode).then(({ svg }) => {
      ref.current!.innerHTML = svg;
    });
  }, [mermaidCode]);

  return (
    <div className="chart-wrapper">
      <p className="summary">{summary}</p>
      <div ref={ref} />
    </div>
  );
}
```

#### 아키텍처 흐름 — 차트 응답 포함

```
[점주 질의] "지난 4주 매출 추이 보여줘"
    ↓
[Agent 라우터] → Text-to-SQL Agent
    ↓
[SQL 실행] → Data Warehouse → 주간 매출 데이터 반환
    ↓
[LLM — Chart 프롬프트] → Mermaid 코드 + 요약 생성 (Structured Output)
    ↓
[API 응답] { summary, chart_type, mermaid_code }
    ↓
[프론트엔드] mermaid.render() → SVG 차트 렌더링
```

---

## 개선 방향

### 1. Batch 사전 생성으로 Token 절약

매주 실적 데이터 기반의 반복적인 질의(판매량, 매출 순위 등)는 매번 LLM을 호출할 경우 토큰 비용이 누적된다.

- **방식**: 배치 스케줄러가 주간 데이터를 미리 집계·요약하여 DB에 저장
- **효과**: 점주의 일반적인 리포트 질의는 DB 조회만으로 응답 → LLM 호출 없이 처리
- **적용 범위**: 매출 합계, 상품별 판매량, 전주 대비 증감 등 정형화된 지표

```
[배치] 주간 데이터 → LLM 요약 → DB 저장
[질의] 점주 요청  → DB 조회  → 즉시 반환  (LLM 호출 X)
```

#### 이력 축약 (History Compression)

- 과거 대화 이력을 비용이 낮은 경량 모델(예: Claude Haiku)로 요약
- 원본 대화 메시지 대신 압축된 요약을 컨텍스트로 주입하여 토큰 절감

#### Structured Output + Redis 캐싱

점주들이 자주 사용하는 질의 패턴·키워드·데이터를 LLM에 Structured Output으로 추출하고 Redis에 저장하여 대화 흐름을 유지한다.

```python
# 자주 사용하는 질의 패턴을 Structured Output으로 추출
class StoreContext(BaseModel):
    store_id: str
    frequent_queries: list[str]   # 자주 묻는 질의 유형
    key_metrics: dict             # 점주가 주로 보는 지표
    recent_topics: list[str]      # 최근 대화 주제 키워드

# Redis에 저장 — 대화 흐름 유지
redis.setex(
    f"context:{user_id}",
    ttl=86400,
    value=store_context.model_dump_json()
)
```

- **효과**: 전체 대화 이력을 재전송하지 않고 구조화된 컨텍스트만 전달 → 토큰 대폭 절감
- **대화 흐름 유지**: 이전 질의 주제·관심 지표를 Redis에서 불러와 연속성 있는 답변 제공

---

## 문제 해결 사례

**문제 1: LLM이 위험한 SQL(DELETE, DROP) 생성**

- 원인: 프롬프트만으로는 완전한 제어 불가
- 해결: SQL 실행 전 위험 키워드 정규표현식 검사 레이어 추가 (Defense in Depth)
- 결과: 안전성 100% 보장

**문제 2: 스키마 미제공 시 환각 컬럼명으로 SQL 생성**

- 원인: 테이블 구조를 모르는 상태에서 임의 컬럼명 사용
- 해결: 매 요청마다 시스템 프롬프트에 관련 스키마 동적 주입
- 결과: SQL 정확도 대폭 향상

---

## 핵심 학습

- **Text-to-SQL 핵심**: 스키마 제공 + Few-shot 예시가 정확도를 결정 — 프롬프트 엔지니어링이 핵심
- **안전장치 필수**: LLM 출력을 신뢰하지 말고 실행 전 검증 레이어 반드시 추가
- **Batch 사전 생성**: 반복성 높은 질의는 배치로 미리 처리하면 LLM 비용과 응답 지연을 동시에 줄임
- **SWE-prune**: 대화 이력 전체를 전달하는 대신 압축·구조화하여 Redis에 캐싱하면 토큰 비용과 컨텍스트 품질을 함께 관리 가능
- **PM + 개발 병행**: 요구사항을 직접 분석하면 구현 방향이 명확해짐 — 커뮤니케이션 비용 절감
- **Mermaid 차트 시각화**: LLM Structured Output으로 Mermaid 코드를 안전하게 추출하고 프론트에서 SVG로 렌더링하면 별도 차트 라이브러리 없이 다양한 시각화 지원 가능
