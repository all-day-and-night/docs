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

- `EXPLAIN PLAN`으로 Full Table Scan 구간 식별
- 복합 인덱스 추가, 불필요한 서브쿼리 → JOIN 전환
- `ROWNUM` 페이징 → `ROW_NUMBER() OVER()` 윈도우 함수 전환

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
