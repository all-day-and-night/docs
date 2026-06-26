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
    → metadata filter로 검색 범위 제한
    → 벡터 검색 (OpenSearch k-NN)
    → 관련 청크 추출
    → AWS Bedrock Claude 생성
    → 근거 포함 답변 반환

[인증 흐름]
initech SSO
    → D&O 사내 인원 인증 + 사용자 정보 조회
    → AWS Secrets Manager에서 서명 키 로드
    → Access Token + Refresh Token 직접 발급
    → Redis에 Refresh Token 저장 (TTL 관리)

[요청 인증]
Authorization: Bearer <access_token>
    → Access Token 검증 (AWS Secrets Manager 서명 키)
    → 만료 시 Refresh Token → Redis 조회 → 재발급
    → FastAPI 핸들러
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

### SSO + 자체 토큰 발급 인증

initech SSO는 D&O 사내 인원 인증 및 사용자 정보 조회 용도로만 사용하고,
토큰 발급은 AWS Secrets Manager에서 서명 키를 관리하여 직접 처리.
Refresh Token은 Redis에 저장해 TTL 기반으로 관리.

```python
import boto3, redis, jwt
from datetime import datetime, timedelta

secrets = boto3.client("secretsmanager")
r = redis.Redis.from_url(REDIS_URL)

def get_signing_key() -> str:
    secret = secrets.get_secret_value(SecretId="dno/jwt-signing-key")
    return secret["SecretString"]

def issue_tokens(user_info: dict) -> dict:
    key = get_signing_key()
    access_token = jwt.encode(
        {"sub": user_info["id"], "exp": datetime.utcnow() + timedelta(minutes=30)},
        key, algorithm="HS256",
    )
    refresh_token = jwt.encode(
        {"sub": user_info["id"], "exp": datetime.utcnow() + timedelta(days=7)},
        key, algorithm="HS256",
    )
    r.setex(f"refresh:{user_info['id']}", timedelta(days=7), refresh_token)
    return {"access_token": access_token, "refresh_token": refresh_token}

@app.post("/auth/login")
async def login(sso_token: str):
    user_info = verify_initech_sso(sso_token)  # SSO로 인증 + 사용자 정보 조회
    return issue_tokens(user_info)

@app.post("/auth/refresh")
async def refresh(refresh_token: str):
    key = get_signing_key()
    payload = jwt.decode(refresh_token, key, algorithms=["HS256"])
    stored = r.get(f"refresh:{payload['sub']}")
    if not stored or stored.decode() != refresh_token:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_info = {"id": payload["sub"]}
    return issue_tokens(user_info)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    key = get_signing_key()
    payload = jwt.decode(token, key, algorithms=["HS256"])
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

**문제 1: initech SSO와 Redis 기반 토큰 인증 연동의 어려움**

- 원인: initech SSO 솔루션이 자체 세션 방식으로 동작해 외부 Redis 기반 토큰 체계와 직접 통합 불가
- 해결: SSO는 사내 인원 인증 및 사용자 정보 조회 역할만 담당, 이후 토큰 발급은 완전히 분리 — 서명 키를 AWS Secrets Manager로 관리하고 Access Token / Refresh Token을 직접 생성, Refresh Token은 Redis에 TTL과 함께 저장
- 결과: SSO 의존도를 최소화하면서 표준 JWT 기반 인증 흐름 확보, 토큰 만료 및 갱신 제어 가능

**문제 2: 단일 인덱스 검색 범위 과다**

- 원인: 모든 문서를 하나의 OpenSearch 인덱스에 임베딩하면서 문서 유형과 업무 도메인이 섞였고, 관련 없는 문서까지 검색 후보에 포함되어 컨텍스트 양이 늘어남
- 해결: 문서 유형, 업무 도메인, 권한 범위 등의 metadata를 임베딩 데이터에 함께 저장하고, 질의 시 metadata filter를 적용해 단일 인덱스 안에서도 검색 범위를 제한
- 결과: 인덱스 구조는 단일로 유지하면서 검색 후보와 불필요한 컨텍스트 주입을 줄여 RAG 응답 품질과 효율 개선

**문제 3: OpenSearch 벡터 검색 결과 품질 불균일**

- 원인: 코사인 유사도만으로는 의미 매칭 한계
- 해결: Hybrid Search (벡터 + BM25 키워드 검색) 조합으로 전환
- 결과: Precision@5 개선

---

## 성능 개선

| 항목 | 개선 전 | 개선 후 | 방법 |
|------|--------|--------|------|
| 검색 범위 | 단일 인덱스 전체 검색 | metadata filter 기반 범위 제한 | 문서 유형·업무 도메인·권한 metadata |
| 답변 품질 | FAQ 고정 답변 | 문맥 기반 생성 | RAG + Bedrock |
| 검색 품질 | 벡터 검색 단독 | Hybrid Search | OpenSearch k-NN + BM25 |

---

## 핵심 학습

- **RAG 파이프라인 설계**: 청킹 → 임베딩 → 인덱싱 → 검색 → 생성 각 단계의 품질이 최종 답변 품질 결정
- **OpenSearch 검색 범위 제어**: 단일 인덱스에서도 metadata filter를 함께 사용하면 관련 없는 문서 유입과 컨텍스트 증가를 줄일 수 있음
- **AWS Bedrock**: 모델 선택(Claude vs Titan)에 따른 비용/품질 트레이드오프 경험
- **관리자 기능 중요성**: RAG 시스템은 문서 품질 관리가 핵심 — 업로드/삭제/재인덱싱 운영 도구 필수
- **인증 아키텍처 분리**: 외부 SSO는 인증·정보조회 역할로 한정하고, 토큰 발급 키는 AWS Secrets Manager로 자체 관리 — 서드파티 솔루션과의 결합도를 낮추면서 Redis 기반 Refresh Token 갱신 흐름 구현
