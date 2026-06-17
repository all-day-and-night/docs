# LG 디스플레이 뉴스 기반 기업 분석 시스템

::: info 프로젝트 개요
- **기간**: 2024.11 ~ 2024.12 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → LG 디스플레이 (고객사)
- **연관**: [메일 AI Agent](./03-lgd-mail-agent) — 동일 고객사 선행 프로젝트
:::

---

## 배경 및 목적

LG 디스플레이 내부 분석팀이 경쟁사 및 협력사의 **최신 뉴스를 자동으로 수집하고 LLM으로 분석**하여 리포트를 생성하는 시스템.  
여러 외부 뉴스 API를 병렬로 호출하는 것이 핵심 성능 과제였다.

---

## 아키텍처

```
POST /analyze (기업명 입력)
    ↓
FastAPI Server
    ↓ ThreadPoolExecutor 병렬 호출
    ├→ 뉴스 API 1
    ├→ 뉴스 API 2
    └→ 뉴스 API 3
        → 결과 집계 / 정제
        → LLM 분석 엔진 (기업 동향 요약)
        → 응답 반환
```

---

## 주요 구현

### 멀티스레드 병렬 API 호출

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def collect_news(company: str) -> list[NewsItem]:
    apis = [NewsAPI1, NewsAPI2, NewsAPI3]
    results = []

    with ThreadPoolExecutor(max_workers=len(apis)) as executor:
        futures = {executor.submit(api.fetch, company): api for api in apis}
        for future in as_completed(futures):
            try:
                results.extend(future.result())
            except Exception as e:
                logger.warning(f"API 호출 실패: {e}")

    return results
```

- 순차 호출 대비 응답 시간 = **가장 느린 API 1개 시간**으로 단축
- 개별 API 실패 시 다른 소스 결과는 정상 반환 (Partial Success)

---

## 문제 해결 사례

**문제: 뉴스 수집 시간이 너무 길어 사용자 대기 불만**

- 상황: 3개 외부 API 순차 호출 → 평균 9~15초 소요
- 원인: API 1 완료 후 API 2 호출하는 직렬 구조
- 해결: `ThreadPoolExecutor`로 3개 API 동시 호출
- 결과: 평균 응답 시간 3~5초로 단축 (최대 66% 개선)

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 | 방법 |
|------|--------|--------|------|
| 뉴스 수집 시간 | 9~15초 | 3~5초 | ThreadPoolExecutor 병렬 호출 |
| 단일 API 장애 영향 | 전체 실패 | 부분 성공 | Future 개별 예외 처리 |

---

## 핵심 학습

- **I/O Bound 작업의 병렬화**: 외부 API 호출은 CPU 작업이 아닌 I/O 대기 → 스레드 기반 병렬화가 효과적
- **Partial Success 패턴**: 일부 API 실패해도 나머지 결과를 활용하는 방어적 설계
- **Python GIL과 ThreadPoolExecutor**: CPU Bound는 ProcessPool, I/O Bound는 ThreadPool — 구분 기준 명확히 이해
