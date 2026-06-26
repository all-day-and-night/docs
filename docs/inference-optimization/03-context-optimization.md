# 3단계 — Context 최적화: Prefill Latency 줄이기

---

## 문제: 입력 토큰 수가 latency를 결정한다

```
전체 Latency = Prefill 시간 + Decode 시간

Prefill 시간 ∝ 입력 토큰 수
```

RAG 기반 챗봇의 일반적인 입력 구성:

```
시스템 프롬프트          →  약 500 토큰
대화 이력               →  약 2,000 토큰  (대화가 길어질수록 증가)
RAG 검색 결과           →  약 3,000 토큰  (문서 10개 × 300 토큰)
사용자 질문             →  약 50 토큰
─────────────────────────────────────────
전체 입력               →  약 5,550 토큰
```

Prefill 처리 속도가 50 토큰/초라면 첫 번째 토큰까지 **111ms**가 소요된다.  
이것이 **Time To First Token (TTFT)**에 그대로 반영된다.

---

## 원인 분석

| 원인 | 문제 |
|------|------|
| 긴 시스템 프롬프트 | 매 요청마다 반복 전송, 내용은 변하지 않음 |
| 전체 대화 이력 보존 | 오래된 턴은 현재 질문과 무관함 |
| RAG Top-k 과다 | 10개를 가져오지만 3개면 충분한 경우 많음 |
| RAG 중복 청크 | 같은 내용이 여러 번 검색됨 |

---

## 개선 1: RAG Top-k 축소

```
변경 전: 상위 10개 문서 검색 → 약 3,000 토큰
변경 후: 상위  3개 문서 검색 → 약   900 토큰
토큰 감소: 2,100 토큰
```

대부분의 도메인에서 **Top-3 검색이 Top-10 대비 95% 이상의 답변 품질**을 유지한다.

```python
# 변경 전
retriever = vectorstore.as_retriever(search_kwargs={"k": 10})

# 변경 후
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
```

---

## 개선 2: 대화 이력 요약

전체 메시지 이력 대신 오래된 턴을 요약해서 주입한다.

```
변경 전:
  [1번째 턴] 사용자: ... (200 토큰)
  [1번째 턴] 어시스턴트: ... (400 토큰)
  [2번째 턴] 사용자: ... (150 토큰)
  [2번째 턴] 어시스턴트: ... (350 토큰)
  이력 합계: 1,100 토큰

변경 후:
  [1~2번째 턴 요약]: "사용자가 X와 Y에 대해 질문했고 어시스턴트가 설명함" (80 토큰)
  이력 합계: 80 토큰

멀티턴 대화당 토큰 감소: 1,020 토큰
```

```python
SUMMARY_THRESHOLD = 6  # 6턴 이상이면 요약

async def get_messages_with_summary(history: list[dict]) -> list[dict]:
    if len(history) <= SUMMARY_THRESHOLD:
        return history

    old_turns = history[:-2]
    recent_turns = history[-2:]

    summary_prompt = "다음 대화를 2~3문장으로 요약해줘:\n\n"
    for msg in old_turns:
        summary_prompt += f"{msg['role']}: {msg['content']}\n"

    summary_resp = await client.chat.completions.create(
        model="mistral", messages=[{"role": "user", "content": summary_prompt}], max_tokens=150,
    )
    summary_text = summary_resp.choices[0].message.content

    return [
        {"role": "system", "content": f"[이전 대화 요약] {summary_text}"},
        *recent_turns,
    ]
```

---

## 개선 3: 시스템 프롬프트 압축

```
변경 전 (장황한 버전): 약 150 토큰
"당신은 친절하고 안전하며 정직한 AI 어시스턴트입니다. 우리 웹툰 플랫폼 관련 질문을..."

변경 후 (간결한 버전): 약 15 토큰
"웹툰 플랫폼 어시스턴트. 친절하고 전문적으로. 필요시 마크다운 사용."

요청당 토큰 감소: 135 토큰
```

---

## 개선 4: Context Compression (LLMLingua)

RAG 문서를 프롬프트에 주입하기 전에 압축 모델로 정보량이 낮은 문장을 제거한다.

```
원본 검색 문단: 300 토큰
압축 후:        120 토큰  (60% 감소)
```

```python
from llmlingua import PromptCompressor

compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank"
)

compressed = compressor.compress_prompt(
    raw_context,
    rate=0.4,  # 원문의 40% 수준으로 압축
    force_tokens=["웹툰", "작가", "업로드"],
)
```

---

## 개선 효과 합산

| 구성 요소 | 변경 전 | 변경 후 | 감소량 |
|----------|---------|---------|-------|
| 시스템 프롬프트 | 500 토큰 | 15 토큰 | 485 |
| 대화 이력 | 2,000 토큰 | 80 토큰 | 1,920 |
| RAG 문서 | 3,000 토큰 | 360 토큰 | 2,640 |
| 사용자 질문 | 50 토큰 | 50 토큰 | 0 |
| **합계** | **5,550 토큰** | **505 토큰** | **약 91% 감소** |

---

## 예상 결과

| 조건 | 평균 입력 토큰 | TTFT | 전체 Latency | 요청당 비용 |
|------|-------------|------|------------|-----------|
| A (8K, 최적화 없음) | ~5,500 | ~110ms | ~8초 | $0.042 |
| B (4K, RAG Top-3) | ~1,800 | ~36ms  | ~5초 | $0.018 |
| C (2K, RAG Top-3 + 이력 요약) | ~800 | ~16ms | ~4초 | $0.010 |
| D (2K + 압축) | ~500 | ~10ms | ~3.5초 | $0.007 |
