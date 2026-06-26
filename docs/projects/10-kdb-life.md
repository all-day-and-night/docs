# KDB 생명 Agentic AI Prototype

::: info 프로젝트 개요
- **기간**: 2025.10 ~ 2025.11 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → KDB 생명 (고객사)
- **특징**: Agentic AI 기능 중 약관 변경 대비표 자동 생성 PoC
:::

---

## 배경 및 목적

보험 약관이 수정될 때마다 **개정 전후 내용을 비교하는 변경 대비표**를 수작업으로 만드는 데 많은 인력이 소요되었다.  
Agentic AI의 기능 중 하나로, **git diff 알고리즘 기반으로 변경 라인을 감지**하고 수정·추가·삭제를 자동 분류한 뒤 목차·페이지·라인 정보와 함께 표로 출력하는 PoC를 구현했다.

---

## 아키텍처

```
구 약관 문서 ──┐
신 약관 문서 ──┤→ 텍스트 추출 (조항·라인 단위)
               ↓
         git diff 알고리즘 (SequenceMatcher)
               ↓
         변경 라인 분류 (수정 / 추가 / 삭제)
         + 목차 / 페이지 / 라인 번호 매핑
               ↓
         변경 대비표 생성 (표 형태 출력)
               ↓
         S3 업로드 → Presigned URL 반환
```

---

## 주요 구현

### 1. git diff 알고리즘 기반 변경 감지

Python 표준 라이브러리의 `difflib.SequenceMatcher`를 활용하여 git diff와 동일한 LCS(Longest Common Subsequence) 기반 비교를 수행했다.

```python
from difflib import SequenceMatcher
from dataclasses import dataclass

@dataclass
class DiffLine:
    change_type: str   # "수정" | "추가" | "삭제"
    toc: str           # 목차 (예: "제3조 보험금 지급")
    page: int          # 페이지 번호
    line: int          # 라인 번호
    old_text: str
    new_text: str

def detect_changes(old_lines: list[str], new_lines: list[str], toc_map: dict, page_map: dict) -> list[DiffLine]:
    matcher = SequenceMatcher(None, old_lines, new_lines)
    results = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue

        old_block = old_lines[i1:i2]
        new_block = new_lines[j1:j2]

        if tag == "replace":
            for idx, (old, new) in enumerate(zip(old_block, new_block)):
                line_no = i1 + idx + 1
                results.append(DiffLine(
                    change_type="수정",
                    toc=toc_map.get(line_no, ""),
                    page=page_map.get(line_no, 0),
                    line=line_no,
                    old_text=old,
                    new_text=new,
                ))
        elif tag == "insert":
            for idx, new in enumerate(new_block):
                line_no = j1 + idx + 1
                results.append(DiffLine(
                    change_type="추가",
                    toc=toc_map.get(line_no, ""),
                    page=page_map.get(line_no, 0),
                    line=line_no,
                    old_text="",
                    new_text=new,
                ))
        elif tag == "delete":
            for idx, old in enumerate(old_block):
                line_no = i1 + idx + 1
                results.append(DiffLine(
                    change_type="삭제",
                    toc=toc_map.get(line_no, ""),
                    page=page_map.get(line_no, 0),
                    line=line_no,
                    old_text=old,
                    new_text="",
                ))

    return results
```

### 2. 변경 대비표 출력

```python
import pandas as pd

def build_report(diffs: list[DiffLine]) -> pd.DataFrame:
    return pd.DataFrame([
        {
            "변경 유형": d.change_type,
            "목차": d.toc,
            "페이지": d.page,
            "라인": d.line,
            "개정 전": d.old_text.strip(),
            "개정 후": d.new_text.strip(),
        }
        for d in diffs
    ])
```

출력 예시:

| 변경 유형 | 목차 | 페이지 | 라인 | 개정 전 | 개정 후 |
|-----------|------|--------|------|---------|---------|
| 수정 | 제3조 보험금 지급 | 5 | 42 | 보험금을 지급한다 | 보험금을 지급할 수 있다 |
| 추가 | 제7조 면책사항 | 11 | 98 | | 천재지변으로 인한 손해는 보상하지 않는다 |
| 삭제 | 제9조 계약 해지 | 14 | 130 | 30일 이내 환급한다 | |

### 3. S3 업로드 및 Presigned URL 반환

```python
import boto3
import uuid

def upload_and_presign(df: pd.DataFrame, bucket: str, expires_in: int = 3600) -> str:
    s3 = boto3.client("s3")
    key = f"reports/{uuid.uuid4()}.xlsx"

    buffer = BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)

    s3.upload_fileobj(buffer, bucket, key)

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )
    return url
```

- 생성된 변경 대비표를 Excel로 변환 후 S3에 업로드
- Presigned URL(기본 1시간 유효)을 API 응답으로 반환하여 별도 인증 없이 다운로드 가능

---

## 문제 해결 사례

**문제: 약관 문서의 목차·페이지 정보가 비정형**

- 상황: Word/PDF 문서마다 조항 번호 형식이 다르고(제1조, 1., ①, 가.), 페이지 구분 기준도 상이함
- 해결: 정규표현식 다중 패턴으로 목차 추출, 페이지 구분자를 파싱하여 라인-페이지 매핑 테이블 사전 생성
- 결과: 주요 약관 형식 90% 이상 파싱 성공

**문제: 동기 처리로 인한 K8s livenessProbe 실패**

- 상황: 문서 파싱 → SequenceMatcher 비교 → Excel 생성까지 FastAPI 요청 스레드가 작업을 붙잡고 있어 응답이 수십 초 지연됨. K8s livenessProbe가 15초로 설계되어 있었고, 처리 중인 파드가 응답을 반환하지 못해 계속 재시작되는 문제 발생
- 해결: Celery + Redis 기반 비동기 작업 큐 도입. FastAPI는 task_id만 즉시 반환하고 실제 처리는 Celery 워커에 위임. 작업 유형별 큐를 분리하여 파싱과 비교 작업을 독립적으로 스케일아웃 가능하도록 구성

```python
# celery_app.py
from celery import Celery
from kombu import Queue

celery = Celery(broker="redis://localhost:6379/0", backend="redis://localhost:6379/0")

celery.conf.task_queues = (
    Queue("parse_queue"),    # 문서 파싱 전용
    Queue("compare_queue"),  # diff · 표 생성 전용
)

@celery.task(queue="parse_queue")
def parse_document(file_path: str) -> dict:
    # 텍스트 추출, 목차·페이지 매핑 생성
    ...

@celery.task(queue="compare_queue")
def run_compare(old_path: str, new_path: str) -> str:
    # SequenceMatcher 비교 → Excel 생성 → S3 업로드
    ...
    return presigned_url
```

```python
# main.py (FastAPI)
@app.post("/compare")
async def compare(files: ...):
    task = run_compare.delay(old_path, new_path)
    return {"task_id": task.id}  # 즉시 반환 → livenessProbe 정상 응답

@app.get("/status/{task_id}")
async def status(task_id: str):
    task = run_compare.AsyncResult(task_id)
    return {"status": task.status, "result": task.result}
```

```bash
# 워커를 별도 파드로 분리하여 큐별 스케일아웃
celery -A celery_app worker -Q parse_queue --concurrency=2
celery -A celery_app worker -Q compare_queue --concurrency=4
```

- 결과: FastAPI 파드는 즉시 응답을 반환하게 되어 livenessProbe 실패 해소. 처리량이 늘어날 경우 compare_queue 워커 파드만 독립적으로 증설 가능

---

## 핵심 학습

- **git diff 알고리즘 응용**: `SequenceMatcher`의 `get_opcodes()`로 replace / insert / delete를 구분하면 라인 단위 변경 추적이 가능
- **메타 정보 매핑**: 변경된 라인 번호만으로는 부족하고, 목차·페이지를 사전에 인덱싱해 두어야 의미 있는 대비표 생성 가능
- **S3 Presigned URL**: 파일을 직접 응답으로 내리지 않고 URL만 반환하면 대용량 파일도 서버 부담 없이 전달 가능
- **비동기 작업 큐**: 오래 걸리는 작업은 Celery로 위임하고 API는 task_id만 반환하는 패턴으로 K8s health-check와 충돌을 피할 수 있음. 큐를 분리하면 작업 유형별로 독립적인 스케일아웃이 가능
