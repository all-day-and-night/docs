# 스타벅스 BI Report Agent PoC

::: info 프로젝트 개요
- **기간**: 2025.12 (1개월)
- **역할**: PM, Backend Developer
- **소속**: LG CNS → 스타벅스 코리아 (고객사)
- **형태**: PoC (Proof of Concept)
- **특징**: PM 역할 병행 — 요구사항 분석부터 개발까지 전담
:::

---

## 배경 및 목적

스타벅스 각 매장의 수집 데이터를 기반으로 **매장별 BI 리포트를 자동 생성**하고,  
운영 담당자가 자연어로 데이터를 질의할 수 있는 **Text-to-SQL Agent**를 구현하는 PoC.

---

## 아키텍처

```
담당자 자연어 질문 (예: 이번 주 판교점 아메리카노 판매량?)
    ↓
Text-to-SQL Agent (AWS Bedrock)
    → 스키마 로드
    → SQL 생성 (Claude)
    → SQL 유효성 검사 (위험 키워드 차단)
    → SQL 실행 → Data Warehouse
    → 결과 자연어 요약 → 반환

배치 스케줄러
    → 일별 전 매장 BI 리포트 자동 생성 (PDF/Excel)
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

### PM 역할 — 요구사항 분석 및 업무 분장

- 스타벅스 현업 담당자 인터뷰를 통한 핵심 질의 유형 수집
- 개발 범위 정의 및 일정 수립
- PoC 데모 시나리오 설계

---

## 문제 해결 사례

**문제 1: LLM이 위험한 SQL(DELETE, DROP) 생성**

- 원인: 프롬프트만으로는 완전한 제어 불가
- 해결: SQL 실행 전 위험 키워드 정규표현식 검사 레이어 추가 (Defense in Depth)
- 결과: 안전성 100% 보장

**문제 2: 스키마 정보 미제공 시 엉뚱한 컬럼명으로 SQL 생성**

- 원인: 테이블 구조를 모르는 상태에서 환각 컬럼명 사용
- 해결: 매 요청마다 시스템 프롬프트에 관련 스키마 동적 주입
- 결과: SQL 정확도 대폭 향상

---

## 핵심 학습

- **Text-to-SQL 핵심**: 스키마 제공 + Few-shot 예시가 정확도를 결정 — 프롬프트 엔지니어링이 핵심
- **안전장치 필수**: LLM 출력을 신뢰하지 말고 실행 전 검증 레이어 반드시 추가
- **PM + 개발 병행**: 요구사항을 직접 분석하면 구현 방향이 명확해짐 — 커뮤니케이션 비용 절감
- **BI Agent 한계**: 복잡한 다중 조인, 집계 함수 조합은 여전히 LLM 오류율 높음 — 점진적 기능 확장 필요
