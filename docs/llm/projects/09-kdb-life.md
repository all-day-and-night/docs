# KDB 생명 Agentic AI Prototype

::: info 프로젝트 개요
- **기간**: 2025.10 ~ 2025.11 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → KDB 생명 (고객사)
- **특징**: 보험 약관 문서 변경 자동 분석
:::

---

## 배경 및 목적

보험 약관이 수정될 때마다 **개정 전후 내용을 비교하는 변경 대비표**를 수작업으로 만드는 데 많은 인력이 소요되었다.  
LLM 기반으로 이 과정을 자동화하여 **인건비를 효율화**하는 것이 핵심 목적.

---

## 아키텍처

```
구 약관 문서 (PDF/Word) ──┐
신 약관 문서 (PDF/Word) ──┤→ 문서 파싱 (조항 단위 분리)
                          ↓
                    변경 감지 알고리즘 (구조적 비교)
                          ↓ 변경된 조항만
                    AWS Bedrock Claude (변경 내용 요약/분류)
                          ↓
                    변경 대비표 (Excel / JSON)
```

---

## 주요 구현

### 보험 약관 변경 대비표 생성 알고리즘

```python
def generate_diff_report(old_doc: str, new_doc: str) -> list[DiffItem]:
    # 1. 조항 단위로 파싱
    old_clauses = parse_clauses(old_doc)
    new_clauses = parse_clauses(new_doc)

    # 2. 구조적 비교 (조항 번호 기준 매핑)
    diffs = []
    for clause_id in set(old_clauses.keys()) | set(new_clauses.keys()):
        old_text = old_clauses.get(clause_id, "")
        new_text = new_clauses.get(clause_id, "")

        if old_text != new_text:
            # 3. LLM으로 변경 내용 요약
            summary = llm_summarize_diff(old_text, new_text)
            diffs.append(DiffItem(
                clause_id=clause_id,
                old_text=old_text,
                new_text=new_text,
                change_type=classify_change(old_text, new_text),
                summary=summary
            ))

    return diffs
```

- **변경 유형 분류**: 신설 / 수정 / 삭제 자동 분류
- **LLM은 변경된 조항에만 적용**: 전체 문서 LLM 호출 대신 diff 감지 후 필요한 부분만 → 비용 최적화

---

## 문제 해결 사례

**문제: 약관 문서 구조 비정형 — 조항 파싱 어려움**

- 상황: 약관 문서가 Word/PDF로 제공되며 조항 번호 형식이 문서마다 다름 (제1조, 1., ①, 가. 등)
- 원인: 표준화된 구조 없음
- 해결: 정규표현식 기반 다중 패턴 파서 구현, 파싱 실패 시 LLM 보조 파싱으로 Fallback
- 결과: 주요 약관 형식 90% 이상 파싱 성공

---

## 성능 개선 (비용 효율화)

| 항목 | 개선 전 | 개선 후 | 방법 |
|------|--------|--------|------|
| 인건비 | 담당자 수일 소요 | 수분 내 자동 생성 | LLM 자동화 |
| LLM 호출 비용 | 전체 문서 처리 | 변경 조항만 처리 | Diff 감지 후 선별 호출 |
| 처리 정확도 | 수작업 (휴먼 에러) | 알고리즘 + LLM | 자동화 |

---

## 핵심 학습

- **문서 처리 파이프라인**: 파싱 → 구조화 → 비교 → 생성 단계 분리 설계
- **LLM 비용 최적화**: 모든 텍스트를 LLM에 넣지 말고, 전처리로 필요한 부분만 선별하는 것이 핵심
- **도메인 특화 파서**: 보험/법률 문서는 표준이 없어 도메인 특화 파싱 로직이 품질을 좌우
