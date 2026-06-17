# LG 전자 사용자 메뉴얼 생성 자동화

::: info 프로젝트 개요
- **기간**: 2024.11 ~ 2024.12 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → LG 전자 (고객사)
:::

---

## 배경 및 목적

LG 전자 제품의 업무 메뉴얼 데이터를 기반으로 **PowerPoint 슬라이드를 자동 생성**하는 시스템.  
기존에는 담당자가 메뉴얼 내용을 직접 PPT로 작성했는데, 이를 API 호출 한 번으로 자동화했다.

---

## 아키텍처

```
요청자 (메뉴얼 데이터 JSON)
    ↓
FastAPI
    → PPT 템플릿 로드 (python-pptx)
    → 슬라이드 생성 엔진 (섹션별 레이아웃 매핑)
    → output.pptx 생성
    → 파일 반환
```

---

## 주요 구현

### python-pptx 템플릿 기반 슬라이드 생성

```python
from pptx import Presentation
from pptx.util import Inches, Pt

def generate_manual(data: ManualData) -> bytes:
    prs = Presentation("templates/manual_template.pptx")
    slide_layout = prs.slide_layouts[1]  # 정형 레이아웃 선택

    for section in data.sections:
        slide = prs.slides.add_slide(slide_layout)
        slide.shapes.title.text = section.title
        slide.placeholders[1].text = section.content

    output = BytesIO()
    prs.save(output)
    return output.getvalue()
```

- 미리 정의된 PPT 템플릿(마스터 슬라이드)에 데이터만 주입하는 방식
- 섹션 유형별(개요, 절차, 주의사항)로 레이아웃 분기 처리

---

## 문제 해결 사례

**문제: 템플릿 폰트/스타일이 생성된 슬라이드에서 깨짐**

- 상황: 템플릿의 브랜드 폰트가 생성된 슬라이드에서 기본 폰트로 변환됨
- 원인: `add_slide()` 후 텍스트 직접 설정 시 런(run) 단위 서식이 초기화됨
- 해결: 텍스트프레임의 기존 런(run)을 유지하고 내용만 교체하는 방식으로 변경
- 결과: 템플릿 서식 100% 보존

---

## 핵심 학습

- **python-pptx 구조**: Presentation → Slide → Shape → TextFrame → Paragraph → Run 계층 이해
- **템플릿 기반 자동화**: 디자인은 템플릿에, 데이터는 코드에 — 유지보수 분리 원칙
- **BytesIO 활용**: 파일 저장 없이 메모리에서 파일 생성 후 API 응답으로 직접 반환
