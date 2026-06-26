# RDS & Connection Pool 관리

> ← [도메인 접속 & 보안](./06-domain-access)

---

## 왜 Connection Pool 관리가 중요한가

```
파드 1 (HPA 스케일 아웃 이전)
  pool: 10 connections → DB (max_connections: 100)

파드 10 (HPA 스케일 아웃 이후)
  pool: 10 × 10 = 100 connections
  → DB max_connections 도달 → 신규 연결 거부 → 서비스 장애
```

HPA로 파드 수가 늘면 DB 연결 수가 `pool_size × pod_count`로 선형 증가한다.  
RDS의 `max_connections`를 초과하면 `too many connections` 에러가 발생한다.

---

## RDS 구성 (Private Subnet)

```hcl
# terraform/rds.tf 예시

resource "aws_db_subnet_group" "main" {
  name       = "${var.cluster_name}-db-subnet"
  subnet_ids = data.aws_subnets.private.ids    # EKS와 동일한 VPC Private 서브넷
}

resource "aws_db_instance" "main" {
  identifier        = "${var.cluster_name}-postgres"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.medium"           # vCPU 2개
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "appdb"
  username = "appuser"
  password = var.db_password                   # Secrets Manager 권장

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az               = true    # 운영 환경 HA
  deletion_protection    = true

  tags = local.tags
}

# EKS 노드에서 RDS 접근 허용
resource "aws_security_group_rule" "eks_to_rds" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.eks.node_security_group_id
  security_group_id        = aws_security_group.rds.id
}
```

---

## Connection Pool 사이즈 산정 공식

### PostgreSQL 권장 공식

```
pool_size = (vCPU × 2) + effective_spindle_count
```

- **`vCPU × 2`**: DB 서버 CPU 코어당 동시 처리 가능한 연결 수
- **`effective_spindle_count`**: HDD 스핀들 수. SSD/NVMe는 `1`로 계산

**RDS 인스턴스별 권장 pool_size (SSD 기준):**

| RDS 인스턴스 | vCPU | 권장 pool_size | 최대 max_connections |
|-------------|------|---------------|---------------------|
| db.t3.micro | 2 | `(2×2)+1 = 5` | ~87 |
| db.t3.medium | 2 | `(2×2)+1 = 5` | ~412 |
| db.r6g.large | 2 | `(2×2)+1 = 5` | ~1706 |
| db.r6g.xlarge | 4 | `(4×2)+1 = 9` | ~3414 |

::: info RDS max_connections 공식
RDS PostgreSQL의 `max_connections`는 인스턴스 메모리에 따라 자동 결정된다:
```
max_connections = LEAST({DBInstanceClassMemory/9531392}, 5000)
```
`db.t3.medium` (4GB RAM): `4×1024×1024×1024 / 9531392 ≈ 412`
:::

### 실제 적용 예시

```
RDS: db.t3.medium (vCPU 2, RAM 4GB)
  권장 pool_size per pod: 5
  RDS max_connections: ~412

HPA 설정:
  minReplicas: 2
  maxReplicas: 10

최대 DB 연결 = 5 × 10 = 50 connections  ← max_connections(412)의 12%
```

Pool 사이즈를 작게 유지하면 파드가 최대로 스케일 아웃되어도 DB 연결이 안전 범위 내에 있다.

---

## 애플리케이션별 Pool 설정

### Spring Boot (HikariCP)

```yaml
# application-prod.yaml
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST}:5432/${DB_NAME}
    username: ${DB_USER}
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 5          # 위 공식 기반 결정
      minimum-idle: 2               # 최소 유지 연결 수
      connection-timeout: 30000     # 연결 대기 최대 30초
      idle-timeout: 600000          # 유휴 연결 10분 후 해제
      max-lifetime: 1800000         # 연결 최대 수명 30분 (RDS 재시작 대비)
      keepalive-time: 60000         # 1분마다 keepalive 쿼리
      pool-name: HikariPool-service-a
```

::: tip max-lifetime 설정 필수
RDS 재부팅, 장애 조치(failover) 시 기존 연결이 끊어진다.  
`max-lifetime`을 RDS wait_timeout보다 짧게 설정하면 자동으로 연결을 갱신한다.
:::

### FastAPI (SQLAlchemy + asyncpg)

```python
# database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine = create_async_engine(
    DATABASE_URL,
    pool_size=5,          # 위 공식 기반 결정
    max_overflow=2,       # pool_size 초과 시 임시 추가 가능 연결 수
    pool_timeout=30,      # 연결 대기 최대 30초
    pool_recycle=1800,    # 30분마다 연결 갱신 (max-lifetime 상당)
    pool_pre_ping=True,   # 사용 전 연결 유효성 확인 (끊어진 연결 자동 처리)
    echo=False,
)
```

---

## HPA 스케일 아웃 시 연결 급증 문제

### 문제 상황

```
정상 상태:  파드 2개 × pool 5 = 10 connections
트래픽 증가: 파드 10개 × pool 5 = 50 connections  ← 순간 급증
```

HPA가 파드를 추가하는 몇 초 동안 기존 파드에 부하가 몰리고, 새 파드들이 동시에 DB 연결을 맺으려 한다. 이 순간 연결 수가 `max_connections`에 근접할 수 있다.

### 해결책 1: PgBouncer (Transaction Pooling)

PgBouncer를 DB 앞단에 두면 수천 개의 앱 연결을 실제 DB 연결 수십 개로 압축한다.

```
파드 1~10 (각각 pool 5)
  → 50 connections
      ↓
  PgBouncer (transaction pool)
      ↓
  10 connections → RDS
```

**PgBouncer Kubernetes 배포 예시:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgbouncer
  namespace: database
spec:
  replicas: 2   # PgBouncer 이중화
  selector:
    matchLabels:
      app: pgbouncer
  template:
    spec:
      containers:
        - name: pgbouncer
          image: bitnami/pgbouncer:latest
          env:
            - name: POSTGRESQL_HOST
              value: "your-rds-endpoint.amazonaws.com"
            - name: POSTGRESQL_PORT
              value: "5432"
            - name: PGBOUNCER_DATABASE
              value: "appdb"
            - name: PGBOUNCER_POOL_MODE
              value: "transaction"      # 트랜잭션 단위 풀링 (가장 효율적)
            - name: PGBOUNCER_MAX_CLIENT_CONN
              value: "200"             # 앱에서 받을 최대 연결 수
            - name: PGBOUNCER_DEFAULT_POOL_SIZE
              value: "10"              # 실제 DB 연결 수
```

**앱에서 PgBouncer로 연결:**
```yaml
spring:
  datasource:
    url: jdbc:postgresql://pgbouncer.database.svc.cluster.local:5432/appdb
```

### 해결책 2: RDS Proxy (AWS 관리형)

AWS RDS Proxy는 PgBouncer와 유사하지만 완전 관리형이다.

```hcl
resource "aws_db_proxy" "main" {
  name                   = "${var.cluster_name}-rds-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]
  vpc_subnet_ids         = data.aws_subnets.private.ids

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials.arn
  }
}
```

| 비교 | PgBouncer | RDS Proxy |
|------|-----------|-----------|
| 관리 부담 | 직접 운영 | AWS 관리형 |
| 비용 | EC2 비용만 | vCPU당 $0.015/시간 |
| IAM 인증 | 미지원 | 지원 |
| Failover 처리 | 수동 구성 | 자동 (수초 내) |

---

## DB 자격증명 관리 (Kubernetes Secret)

```yaml
# Secret 생성 (Sealed Secrets 또는 AWS Secrets Manager CSI 권장)
kubectl create secret generic db-credentials \
  --from-literal=DB_HOST=your-rds.amazonaws.com \
  --from-literal=DB_NAME=appdb \
  --from-literal=DB_USER=appuser \
  --from-literal=DB_PASSWORD=your-password \
  -n service-a
```

**Helm values에서 Secret 참조:**
```yaml
# values.yaml에 추가
env:
  - name: DB_HOST
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: DB_HOST
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: DB_PASSWORD
```

::: warning 자격증명 관리 원칙
- DB 비밀번호를 `values.yaml`이나 Git에 평문으로 커밋하지 않는다
- AWS Secrets Manager + CSI Driver 또는 Sealed Secrets를 사용한다
- 주기적 비밀번호 로테이션을 고려한다
:::

---

## Pool 사이즈 결정 체크리스트

```
1. RDS 인스턴스 vCPU 확인
   pool_size_per_pod = (vCPU × 2) + 1

2. HPA maxReplicas 확인
   max_total_connections = pool_size_per_pod × maxReplicas

3. RDS max_connections 확인
   aws rds describe-db-parameters --db-parameter-group-name <group>
   또는 psql: SHOW max_connections;

4. 안전 마진 적용 (80% 이하 권장)
   max_total_connections ≤ max_connections × 0.8

5. PgBouncer/RDS Proxy 필요 여부 판단
   max_total_connections > max_connections × 0.8 → 풀러 도입
```
