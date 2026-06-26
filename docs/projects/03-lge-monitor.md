# LG 전자 임직원 업무용 모니터 신청 사이트

::: info 프로젝트 개요
- **기간**: 2024.03 ~ 2024.05 (3개월)
- **역할**: Backend Developer
- **소속**: LG CNS → LG 전자 (고객사)
- **규모**: 내부 업무 시스템 (LG 전자 임직원 대상)
:::

---

## 배경 및 목적

LG 전자 임직원이 업무용 모니터를 **온라인으로 조회하고 신청**할 수 있는 사내 시스템 구축.  
기존 오프라인 신청 프로세스를 디지털화하는 프로젝트로, 초기 요구사항 분석부터 테이블 설계, REST API 구현까지 전 과정을 담당했다.

---

## 아키텍처

```
React.js SPA (모니터 조회 / 신청 UI)
    ↓ REST API
Spring Boot (REST API)
    ↓ JPA / QueryDSL
MySQL (제품 / 신청 / 승인 데이터)
```

---

## 주요 구현

### 1. 초기 분석 및 테이블 설계

요구사항 분석을 바탕으로 핵심 도메인 엔티티와 관계를 정의했다.

```
MONITOR (모니터 제품)
  ├─ id, model_name, brand, screen_size, resolution
  ├─ stock_count, price
  └─ created_at, updated_at

APPLICATION (신청)
  ├─ id, employee_id (FK → EMPLOYEE)
  ├─ monitor_id (FK → MONITOR)
  ├─ status (PENDING / APPROVED / REJECTED)
  ├─ reason, approved_by
  └─ applied_at, processed_at

EMPLOYEE (임직원)
  ├─ id, emp_no, name, department
  └─ role (USER / ADMIN)
```

신청 이력 추적을 위해 `APPLICATION` 테이블에 상태 변경 시각과 처리자를 별도 컬럼으로 관리했다.

### 2. REST API 설계 및 구현

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/monitors` | 모니터 목록 조회 (브랜드·해상도·재고 필터) |
| GET | `/api/monitors/{id}` | 모니터 상세 조회 |
| POST | `/api/applications` | 신청 생성 |
| GET | `/api/applications/me` | 내 신청 목록 |
| PATCH | `/api/applications/{id}/approve` | 관리자 승인/반려 |

### 3. JPA 엔티티 설계

```java
@Entity
@Table(name = "monitor")
public class Monitor {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String modelName;
    private String brand;
    private Integer screenSize;
    private String resolution;
    private Integer stockCount;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}

@Entity
@Table(name = "application")
public class Application {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "monitor_id")
    private Monitor monitor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Enumerated(EnumType.STRING)
    private ApplicationStatus status;

    private LocalDateTime appliedAt;
    private LocalDateTime processedAt;
}
```

### 4. QueryDSL 도입 — 동적 필터 조회

목록 조회에서 브랜드·화면 크기·재고 여부 등 조건이 선택적으로 조합되는 요구사항에 대해 QueryDSL로 동적 쿼리를 구현했다.

```java
@Repository
@RequiredArgsConstructor
public class MonitorQueryRepository {

    private final JPAQueryFactory queryFactory;

    public List<Monitor> search(MonitorSearchCondition cond) {
        return queryFactory
            .selectFrom(monitor)
            .where(
                brandEq(cond.getBrand()),
                screenSizeGoe(cond.getMinSize()),
                inStock(cond.getOnlyInStock())
            )
            .orderBy(monitor.modelName.asc())
            .fetch();
    }

    private BooleanExpression brandEq(String brand) {
        return StringUtils.hasText(brand) ? monitor.brand.eq(brand) : null;
    }

    private BooleanExpression screenSizeGoe(Integer minSize) {
        return minSize != null ? monitor.screenSize.goe(minSize) : null;
    }

    private BooleanExpression inStock(Boolean onlyInStock) {
        return Boolean.TRUE.equals(onlyInStock) ? monitor.stockCount.gt(0) : null;
    }
}
```

`null`을 반환하는 조건은 QueryDSL이 자동으로 `WHERE` 절에서 제외하므로, 조건 조합마다 별도 메서드를 만들지 않아도 된다.

---

## 핵심 학습

- **요구사항 → 테이블 설계**: 도메인 관계를 먼저 정의하고 엔티티를 도출하는 순서가 중요함을 체감
- **Rest API 설계**: 실무에서 RestFul한 방식의 API 설계를 배우고 적용함
- **QueryDSL 동적 쿼리**: `null` 반환 패턴으로 조건 조합 복잡도를 낮춤 — JPQL 문자열 조합 대비 타입 안전성 확보
- **N+1 방지**: QueryDSL 자체는 N+1을 자동 해결하지 않음 — 연관 엔티티가 필요한 쿼리에서 `.join(...).fetchJoin()` 을 명시적으로 작성해야 해결됨
- **내부 업무 시스템 특성**: 신청 이력의 정확성·추적성이 핵심 — 상태 변경 시각과 처리자를 반드시 기록
