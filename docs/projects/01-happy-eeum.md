# 차세대 사회보장 정부 프로젝트 (행복e음)

::: info 프로젝트 개요
- **기간**: 2022.10 ~ 2023.02 (5개월)
- **역할**: Backend Developer
- **소속**: LG CNS (공공 SI)
- **도메인**: 보건복지부 사회보장 정보시스템 차세대 전환
:::

---

## 배경 및 목적

행복e음 차세대 전환 프로젝트에서 기존 Oracle Procedure 기반 배치 로직을 **Spring Batch 기반으로 마이그레이션**.  
DB 구조 변경에 따른 배치 재설계와 SQL 튜닝으로 성능을 개선했다.

---

## 아키텍처

```
[레거시] Oracle Stored Procedure → [차세대] Spring Batch
                                       Job → Step → Chunk
                                       Reader → Processor → Writer
                                       Oracle DB (신 스키마)
```

---

## 주요 구현

### 감면 대상자 검증 배치 구현

사회보장 정보시스템의 복지 혜택 자격 검증 배치를 담당했다.

| 검증 항목 | 설명 |
|-----------|------|
| 상수도세 감면 대상자 | 기초생활수급자, 장애인, 국가유공자 등 감면 자격 여부를 수급 자격 테이블과 조인하여 검증 |
| 군면제 대상자 | 병역 면제 코드와 복지 수급 이력을 교차 검증하여 중복 수혜 방지 |

- 각 검증 항목은 독립된 Spring Batch Step으로 구성하여 항목별 재시작 가능하도록 설계
- Processor 단계에서 자격 조건 판별 로직 집중, Writer에서 결과 상태 코드 일괄 업데이트

---

### Procedure → Spring Batch Chunk 방식 전환

```java
@Bean
public Step socialBenefitStep() {
    return stepBuilderFactory.get("socialBenefitStep")
        .<BenefitEntity, BenefitResult>chunk(1000)
        .reader(benefitItemReader())
        .processor(benefitItemProcessor())
        .writer(benefitItemWriter())
        .build();
}
```

- Oracle Procedure 내부 커서 루프 → Chunk 방식으로 전환
- Chunk size 1000 단위 트랜잭션 분리 → 대용량 처리 안정성 확보

### JdbcPagingItemReader (OOM 방지)

- `JdbcCursorItemReader` → 전체 ResultSet 메모리 로드 → OOM 위험
- `JdbcPagingItemReader` → 페이지 단위(1000건) 처리 → 안정적

### SQL 튜닝

**1. Query Plan 확인**

```sql
EXPLAIN PLAN FOR
SELECT * FROM benefit_target WHERE status_cd = 'A' AND reg_dt >= '20221001';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
```

**2. Full Scan 식별 후 인덱스 확인**

- `EXPLAIN PLAN` 결과에서 `TABLE ACCESS FULL` 구간 식별
- `USER_INDEXES`, `USER_IND_COLUMNS`로 해당 테이블의 기존 인덱스 및 컬럼 순서 확인

```sql
SELECT index_name, column_name, column_position
FROM user_ind_columns
WHERE table_name = 'BENEFIT_TARGET'
ORDER BY index_name, column_position;
```

**3. 인덱스 순서에 맞게 조회**

- 복합 인덱스 `(status_cd, reg_dt)` 구성 시, WHERE 조건도 동일 순서로 작성
- 선두 컬럼 누락 또는 순서 역전 시 인덱스 미사용 → Full Scan 발생

```sql
-- 인덱스 컬럼 순서 준수
WHERE status_cd = 'A'
  AND reg_dt >= '20221001'
```

**4. 서브쿼리 → JOIN 전환**

- 반복 서브쿼리로 인한 N+1 조회 패턴을 JOIN으로 전환하여 실행 횟수 감소

```sql
-- Before: 서브쿼리 방식
SELECT * FROM benefit_target t
WHERE t.user_id IN (SELECT user_id FROM benefit_master WHERE apply_yn = 'Y');

-- After: JOIN 방식
SELECT t.* FROM benefit_target t
JOIN benefit_master m ON t.user_id = m.user_id
WHERE m.apply_yn = 'Y';
```

---

## 문제 해결 사례

| 문제 | 원인 | 해결 |
|------|------|------|
| 배치 처리 OOM | CursorItemReader 전체 로드 | PagingItemReader 전환 → 안정화 |
| 실패 시 처음부터 재시작 | 체크포인트 없음 | Spring Batch JobRepository 활용 → Step 단위 재시작 |
| 배치 윈도우 초과 | Full Scan + N+1 조회 | 복합 인덱스 + Bulk Insert → 60% 단축 |

---

## 핵심 학습

- **Spring Batch 아키텍처**: Job → Step → Chunk (Reader → Processor → Writer) 흐름 완전 이해
- **Cursor vs Paging Reader**: 대용량 데이터는 반드시 Paging 방식 선택
- **Oracle 실행계획 분석**: `EXPLAIN PLAN`, `DBMS_XPLAN`으로 병목 구간 파악
- **공공 SI 특성**: 변경 통제가 엄격 → 충분한 테스트 시나리오 작성이 필수
