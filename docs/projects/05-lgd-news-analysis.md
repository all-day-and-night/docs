# LG 디스플레이 뉴스 기반 기업 분석 시스템

::: info 프로젝트 개요
- **기간**: 2024.11 ~ 2024.12 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → LG 디스플레이 (고객사)
- **연관**: [메일 AI Agent](./07-lgd-mail-agent) — 동일 고객사 선행 프로젝트
:::

---

## 배경 및 목적

LG 디스플레이 내부 분석팀이 경쟁사 및 협력사의 **최신 뉴스를 자동으로 수집하고 LLM으로 분석**하여 리포트를 생성하는 시스템.  
여러 외부 뉴스 API를 병렬로 호출하는 것이 핵심 성능 과제였다.

---

## 아키텍처

```
POST /aggregate (기업명 입력)
    ↓
FastAPI Server
    ↓ asyncio.gather 비동기 병렬 호출
    ├→ 뉴스 API 1 (httpx.AsyncClient)
    ├→ 뉴스 API 2 (httpx.AsyncClient)
    └→ 뉴스 API 3 (httpx.AsyncClient)
        → 결과 취합 / 정제
        → LLM 분석 엔진 (기업 동향 요약)
        → 응답 반환
```

---

## 주요 구현

### 비동기 병렬 API 호출

```python
from fastapi import FastAPI
import asyncio
import httpx

app = FastAPI()

URLS = [
    "https://api.example.com/a",
    "https://api.example.com/b",
    "https://api.example.com/c",
]

async def fetch(client: httpx.AsyncClient, url: str):
    try:
        response = await client.get(url, timeout=5.0)
        response.raise_for_status()
        return {
            "url": url,
            "status": "success",
            "data": response.json()
        }
    except Exception as e:
        return {
            "url": url,
            "status": "error",
            "error": str(e)
        }

@app.get("/aggregate")
async def aggregate():
    async with httpx.AsyncClient() as client:
        tasks = [fetch(client, url) for url in URLS]
        results = await asyncio.gather(*tasks)

    return {
        "count": len(results),
        "results": results
    }
```

- 순차 호출 대비 응답 시간 = **가장 느린 API 1개 시간**으로 단축
- 개별 API 실패 시 다른 소스 결과는 정상 반환 (Partial Success)

---

## 문제 해결 사례

**문제: 뉴스 수집 시간이 너무 길어 사용자 대기 불만**

- 상황: 3개 외부 API 순차 호출 → 평균 9~15초 소요
- 원인: API 1 완료 후 API 2 호출하는 직렬 구조
- 해결: `asyncio.gather` + `httpx.AsyncClient`로 3개 API 비동기 병렬 호출
- 결과: 평균 응답 시간 3~5초로 단축 (최대 66% 개선)

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 | 방법 |
|------|--------|--------|------|
| 뉴스 수집 시간 | 9~15초 | 3~5초 | ThreadPoolExecutor 병렬 호출 |
| 단일 API 장애 영향 | 전체 실패 | 부분 성공 | Future 개별 예외 처리 |

---

## 핵심 학습

- **I/O Bound 작업의 비동기 병렬화**: 외부 API 호출은 I/O 대기 → `asyncio.gather`로 단일 스레드에서 동시 처리
- **Partial Success 패턴**: 개별 `try/except`로 일부 API 실패해도 나머지 결과를 취합해 반환하는 방어적 설계
- **httpx.AsyncClient**: `requests`의 동기 방식 대신 비동기 HTTP 클라이언트로 FastAPI 이벤트 루프를 블로킹하지 않음
