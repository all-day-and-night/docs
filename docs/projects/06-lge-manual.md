# LG 전자 사용자 메뉴얼 생성 자동화

::: info 프로젝트 개요
- **기간**: 2024.11 ~ 2024.12 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → LG 전자 (고객사)
:::

---

## 배경 및 목적

LG 전자 제품의 업무 메뉴얼 데이터를 기반으로 **LLM이 XML을 생성하고, PPT 템플릿의 태그를 치환하여 슬라이드를 자동 생성**하는 시스템.  
기존에는 담당자가 메뉴얼 내용을 직접 PPT로 작성했는데, 이를 API 호출 한 번으로 자동화했다.

---

## 아키텍처

```
요청자 (메뉴얼 원본 데이터)
    ↓
FastAPI
    → LLM 호출 → XML 형태 매뉴얼 생성
    → XML 파싱 (섹션별 태그 추출)
    → PPT 템플릿 로드 (python-pptx)
    → 템플릿 태그 치환 ({{title}}, {{content}} 등)
    → output.pptx 생성
    → 파일 반환
```

---

## 주요 구현

### 1. LLM으로 XML 형태 매뉴얼 생성

LLM에게 원본 데이터를 전달하고, 슬라이드 구조에 맞는 XML을 출력하도록 프롬프트를 설계했다.

```xml
<!-- LLM 출력 예시 -->
<manual>
  <slide>
    <title>제품 개요</title>
    <content>본 제품은 ...</content>
    <caution>전원 연결 전 반드시 확인하세요.</caution>
  </slide>
  <slide>
    <title>설치 절차</title>
    <content>1. 포장을 개봉합니다. 2. ...</content>
  </slide>
</manual>
```

### 2. XML 파싱 후 PPT 태그 치환

```python
import xml.etree.ElementTree as ET
from pptx import Presentation
from io import BytesIO

def replace_tag(shape, tag: str, value: str):
    if shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            for run in para.runs:
                if tag in run.text:
                    run.text = run.text.replace(tag, value)

def generate_manual(xml_str: str) -> bytes:
    root = ET.fromstring(xml_str)
    prs = Presentation("templates/manual_template.pptx")
    template_slide = prs.slides[0]

    for slide_data in root.findall("slide"):
        title = slide_data.findtext("title", "")
        content = slide_data.findtext("content", "")
        caution = slide_data.findtext("caution", "")

        # 템플릿 슬라이드 복제 후 태그 치환
        slide = duplicate_slide(prs, template_slide)
        for shape in slide.shapes:
            replace_tag(shape, "{{title}}", title)
            replace_tag(shape, "{{content}}", content)
            replace_tag(shape, "{{caution}}", caution)

    output = BytesIO()
    prs.save(output)
    return output.getvalue()
```

- PPT 템플릿에 `{{title}}`, `{{content}}`, `{{caution}}` 등의 태그를 미리 삽입
- LLM 출력 XML을 파싱하여 태그별로 치환 → 디자인과 데이터를 완전히 분리

---

## 문제 해결 사례

**문제: 태그 치환 시 템플릿 폰트/스타일이 깨짐**

- 상황: 텍스트프레임에 직접 `.text =` 로 값을 주입하면 run 단위 서식(폰트, 크기, 색상)이 초기화됨
- 원인: `.text` 속성 setter가 기존 paragraph/run을 모두 덮어쓰는 동작
- 해결: 기존 run을 순회하면서 태그 문자열만 `run.text.replace()`로 교체하여 서식 유지
- 결과: 템플릿 서식 100% 보존

**문제: LLM이 XML 형식을 벗어난 응답을 반환하는 경우**

- 상황: LLM이 간헐적으로 XML 앞뒤에 설명 문구나 마크다운 코드블록을 추가
- 해결: 응답에서 `<manual>...</manual>` 구간만 정규식으로 추출 후 파싱
- 결과: 파싱 실패율 제거

---

## 핵심 학습

- **LLM 출력 구조화**: 자유 텍스트 대신 XML 스키마를 지정하면 파싱 가능한 구조화된 응답을 안정적으로 얻을 수 있음
- **태그 치환 방식**: `add_slide()` + 텍스트 직접 주입 대신 템플릿 태그(`{{tag}}`) 치환으로 디자인과 데이터를 완전히 분리
- **python-pptx 서식 보존**: run 단위로 `replace()`를 적용해야 폰트·색상 등 서식이 유지됨
- **BytesIO 활용**: 파일 저장 없이 메모리에서 생성 후 API 응답으로 직접 반환
