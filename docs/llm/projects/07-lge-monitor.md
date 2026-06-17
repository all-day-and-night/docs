# LG 전자 임직원 업무용 모니터 신청 사이트

::: info 프로젝트 개요
- **기간**: 2024.03 ~ 2024.05 (3개월)
- **역할**: FullStack Developer
- **소속**: LG CNS → LG 전자 (고객사)
- **규모**: 내부 업무 시스템 (LG 전자 임직원 대상)
:::

---

## 배경 및 목적

LG 전자 임직원이 업무용 모니터를 **온라인으로 조회하고 신청**할 수 있는 사내 시스템 구축.  
기존 오프라인 신청 프로세스를 디지털화하여 신청/승인 흐름을 자동화했다.

---

## 아키텍처

```
React.js SPA (모니터 조회 / 신청 UI)
    ↓ REST API
Spring Boot (REST API)
    ↓ JPA
MySQL (제품 / 신청 / 승인 데이터)
```

---

## 주요 구현

### REST API 설계

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/monitors` | 모니터 목록 조회 (필터링) |
| GET | `/api/monitors/{id}` | 모니터 상세 조회 |
| POST | `/api/applications` | 신청 생성 |
| GET | `/api/applications/me` | 내 신청 목록 |
| PATCH | `/api/applications/{id}/approve` | 관리자 승인 |

---

## 핵심 학습

- **Fullstack 개발 경험**: BE/FE 경계를 넘나들며 API 계약 설계의 중요성 체감
- **내부 업무 시스템 특성**: 외부 서비스 대비 UX보다 정확성/추적성이 우선 (신청 이력 로깅 등)
