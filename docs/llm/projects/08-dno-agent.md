# DnO 생성형 AI Agent 프로젝트

::: info 프로젝트 개요
- **기간**: 2025.06 ~ 2025.07 (2개월)
- **역할**: Backend Developer
- **소속**: LG CNS → DnO (고객사)
- **특징**: 기존 규칙 기반 챗봇 → 생성형 AI 챗봇 리뉴얼
:::

---

## 배경 및 목적

기존 FAQ 기반 단순 챗봇을 **RAG(Retrieval Augmented Generation) + AWS Bedrock 기반 생성형 AI 챗봇**으로 전면 리뉴얼.  
사내 FAQ 및 규정 문서를 인덱싱하고, 자연어로 질의하면 근거 문서와 함께 답변을 생성한다.

---

## 아키텍처

```
[문서 인덱싱 파이프라인]
문서 업로드 (PDF/Word/텍스트)
    → 청킹 / 전처리
    → 임베딩 (AWS Bedrock Titan)
    → OpenSearch 벡터 인덱스

[RAG 질의 파이프라인]
사용자 질문
    → 벡터 검색 (OpenSearch k-NN)
    → 관련 청크 추출
    → AWS Bedrock Claude 생성
    → 근거 포함 답변 반환

[인증]
SSO (사내 IdP) → JWT 검증 → FastAPI
```

---

## 주요 구현

### RAG 파이프라인 구성

```python
from langchain_aws import BedrockEmbeddings, ChatBedrock
from langchain_community.vectorstores import OpenSearchVectorSearch

embeddings = BedrockEmbeddings(model_id="amazon.titan-embed-text-v1")
vectorstore = OpenSearchVectorSearch(
    index_name="dno-docs",
    embedding_function=embeddings,
    opensearch_url=OPENSEARCH_URL,
)

retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
llm = ChatBedrock(model_id="anthropic.claude-3-sonnet-20240229-v1:0")

chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=retriever,
    return_source_documents=True,
)
```

### SSO 기반 인증

```python
@app.middleware("http")
async def sso_auth_middleware(request: Request, call_next):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    payload = verify_sso_token(token)  # 사내 IdP 검증
    request.state.user = payload
    return await call_next(request)
```

### 관리자 문서 관리 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/admin/documents` | 문서 업로드 및 인덱싱 |
| DELETE | `/admin/documents/{id}` | 문서 삭제 + 인덱스 제거 |
| GET | `/admin/documents` | 인덱싱된 문서 목록 |
| PATCH | `/admin/documents/{id}` | 문서 재인덱싱 |

---

## 문제 해결 사례

**문제 1: 긴 문서 청킹 시 컨텍스트 단절**

- 원인: 고정 크기(Fixed Size) 청킹은 의미 단위를 무시
- 해결: `RecursiveCharacterTextSplitter` + 오버랩(overlap) 200자 설정
- 결과: 검색 관련성 점수 평균 15% 향상

**문제 2: OpenSearch 벡터 검색 결과 품질 불균일**

- 원인: 코사인 유사도만으로는 의미 매칭 한계
- 해결: Hybrid Search (벡터 + BM25 키워드 검색) 조합으로 전환
- 결과: Precision@5 개선

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 | 방법 |
|------|--------|--------|------|
| 검색 관련성 | 규칙 기반 키워드 매칭 | 의미 기반 벡터 검색 | OpenSearch k-NN |
| 답변 품질 | FAQ 고정 답변 | 문맥 기반 생성 | RAG + Bedrock |
| 청킹 품질 | 고정 크기 | 의미 단위 | Recursive Splitter + Overlap |

---

## 핵심 학습

- **RAG 파이프라인 설계**: 청킹 → 임베딩 → 인덱싱 → 검색 → 생성 각 단계의 품질이 최종 답변 품질 결정
- **OpenSearch 벡터 검색**: k-NN 인덱스 설정(HNSW 파라미터) 튜닝이 성능에 직접 영향
- **AWS Bedrock**: 모델 선택(Claude vs Titan)에 따른 비용/품질 트레이드오프 경험
- **관리자 기능 중요성**: RAG 시스템은 문서 품질 관리가 핵심 — 업로드/삭제/재인덱싱 운영 도구 필수
