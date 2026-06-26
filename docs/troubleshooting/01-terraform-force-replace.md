# Terraform 강제 교체(Force Replace) & 자원 관리

## 개요

Terraform `apply` 중 예상치 못한 **`-/+` (destroy and then create replacement)** 가 발생하거나,  
`^C` 인터럽트로 중단되어 인프라 상태가 꼬이는 경우 대처법을 정리한다.

---

## 발생 상황

```
# module.ec2_gitlab.aws_instance.gitlab must be replaced
-/+ resource "aws_instance" "gitlab" {
  ~ ami = "ami-09a72717a566d88fa" -> "ami-0afe1fd15675c3f15" # forces replacement
```

```
module.ec2_gitlab.aws_instance.gitlab: Still destroying... [id=i-0752f1fbbb7d69591, 00m30s elapsed]
^C

│ Error: waiting for EC2 Instance (i-0752f1fbbb7d69591) delete: context canceled
│ Error: execution halted
```

**AMI ID 변경** → EC2는 immutable 속성 → Terraform이 기존 인스턴스 삭제 후 재생성 계획 수립  
→ 중간에 `^C` 로 중단 → 기존 인스턴스는 terminated 중이지만 새 인스턴스는 미생성 → 상태 불일치

---

## 강제 교체가 발생하는 이유

### Immutable(불변) 속성

AWS 리소스 중 **변경 시 리소스 자체를 교체해야** 하는 속성들이 있다.  
Terraform plan에서 `# forces replacement` 주석으로 표시된다.

| 리소스 | Immutable 속성 예시 |
|--------|-------------------|
| `aws_instance` | `ami`, `subnet_id`, `availability_zone` |
| `aws_lb_target_group_attachment` | `target_id`, `target_group_arn` |
| `aws_rds_instance` | `db_name`, `engine`, `allocated_storage` (일부) |
| `aws_eks_node_group` | `instance_types`, `subnet_ids` |
| `aws_elasticache_cluster` | `engine`, `node_type`, `num_cache_nodes` |

### 이번 케이스 분석

```
-/+ aws_instance.gitlab          → ami 변경 (AMI ID hardcode → 최신 AMI 참조로 변경 등)
-/+ aws_lb_target_group_attachment.gitlab  → target_id가 (known after apply)로 변경됨
```

`lb_target_group_attachment` 의 교체는 **EC2 교체로 인한 연쇄 교체**:  
새 EC2의 instance ID가 `(known after apply)` 이므로 attachment도 재생성 필요.

---

## apply 전 안전 체크리스트

```bash
# 1. plan 내용을 파일로 저장
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary | jq '.resource_changes[] | select(.change.actions[] | contains("delete"))' 

# 2. 교체 대상 리소스 필터링
terraform plan 2>&1 | grep "must be replaced\|forces replacement"

# 3. 영향받는 의존성 확인
terraform graph | dot -Tpng > graph.png
```

---

## 자원 Backup 전략

### EC2 AMI 백업

```bash
# apply 전 현재 인스턴스 AMI 스냅샷 생성
aws ec2 create-image \
  --instance-id i-0752f1fbbb7d69591 \
  --name "gitlab-backup-$(date +%Y%m%d-%H%M%S)" \
  --no-reboot \
  --region ap-northeast-2
```

### EBS 스냅샷 백업

```bash
# Root volume 스냅샷
VOLUME_ID=$(aws ec2 describe-instances \
  --instance-ids i-0752f1fbbb7d69591 \
  --query 'Reservations[].Instances[].BlockDeviceMappings[?DeviceName==`/dev/sda1`].Ebs.VolumeId' \
  --output text)

aws ec2 create-snapshot \
  --volume-id $VOLUME_ID \
  --description "gitlab-pre-terraform-$(date +%Y%m%d)"
```

### Terraform `lifecycle` 으로 삭제 방지

```hcl
resource "aws_instance" "gitlab" {
  ami           = var.ami_id
  instance_type = "t3.medium"

  lifecycle {
    # 프로덕션에서 실수로 삭제되는 것을 방지
    prevent_destroy = true

    # AMI 변경 시 교체 대신 무시 (수동 관리)
    ignore_changes = [ami]

    # 삭제 전 새 리소스 먼저 생성 (zero-downtime replace)
    create_before_destroy = true
  }
}
```

#### `lifecycle` 블록 옵션 비교

| 옵션 | 동작 | 주의사항 |
|------|------|---------|
| `prevent_destroy = true` | `destroy` 명령 또는 리소스 제거 시 오류 발생 | plan 자체를 막지는 않음, 코드에서 `lifecycle` 블록 제거 후 destroy 가능 |
| `ignore_changes = [ami]` | 해당 속성 변경 무시 → 교체 안 함 | Terraform이 관리에서 제외 → 드리프트 발생 가능 |
| `create_before_destroy = true` | 새 리소스 먼저 생성 후 기존 삭제 | IP, DNS 등이 변경될 수 있음. EIP 연결 순서 주의 |

---

## 강제 교체 없이 변경하는 방법

### 방법 1: `ignore_changes` 로 AMI 관리 분리

AMI 업데이트를 Terraform 외부(AWS Systems Manager, Packer 파이프라인 등)에서 관리하고  
Terraform은 AMI 변경을 무시하도록 설정.

```hcl
lifecycle {
  ignore_changes = [ami, user_data]
}
```

### 방법 2: `terraform state` 로 현재 상태 강제 반영

실제 인프라를 유지하면서 tfstate만 현재 상태로 맞춤.

```bash
# 현재 EC2 상태를 state에 강제 반영 (리소스는 건드리지 않음)
terraform import aws_instance.gitlab i-0752f1fbbb7d69591
```

### 방법 3: `-replace` 플래그로 명시적 교체

의도치 않은 교체 대신 **원하는 시점에 명시적으로** 교체.

```bash
# 교체를 원하는 리소스만 지정
terraform apply -replace="module.ec2_gitlab.aws_instance.gitlab"
```

### 방법 4: `target` 으로 범위 제한

위험한 변경을 제외하고 나머지만 먼저 apply.

```bash
# EC2 교체 제외하고 WAF, CloudFront, Subnet 태그만 먼저 적용
terraform apply \
  -target=aws_cloudfront_function.docs_url_rewrite \
  -target=aws_wafv2_web_acl.docs \
  -target=module.vpc.aws_subnet.private[0] \
  -target=module.vpc.aws_subnet.private[1]
```

---

## `^C` 중단 후 복구 방법

```
│ Error: waiting for EC2 Instance delete: context canceled
│ Error: execution halted
```

### 1. 현재 인프라 상태 확인

```bash
# 실제 AWS 상태 확인
aws ec2 describe-instances \
  --instance-ids i-0752f1fbbb7d69591 \
  --query 'Reservations[].Instances[].State.Name' \
  --output text
# → "terminated" | "shutting-down" | "running"
```

### 2. tfstate 새로 고침

```bash
terraform refresh
```

### 3. state에서 고아 리소스 제거 (삭제 완료된 경우)

```bash
# 이미 terminated된 인스턴스가 state에 남아있으면 제거
terraform state rm module.ec2_gitlab.aws_instance.gitlab
terraform state rm aws_lb_target_group_attachment.gitlab
terraform state rm module.ec2_gitlab.aws_eip.gitlab
```

### 4. 다시 apply

```bash
# 중단된 지점부터 재시도
terraform apply
```

---

## 강제 삭제(Force Destroy) 방법

:::danger 주의
강제 삭제는 데이터 손실 위험이 있다. 반드시 백업 후 진행.
:::

### state에서 리소스 제거 (AWS 리소스는 유지)

```bash
# Terraform 관리에서 제외 (실제 리소스는 살아있음)
terraform state rm <resource_address>
```

### state에 없는 리소스 삭제 (AWS CLI 직접)

```bash
# EC2 강제 종료
aws ec2 terminate-instances --instance-ids i-0752f1fbbb7d69591

# EIP 릴리즈
aws ec2 release-address --allocation-id eipalloc-076675e76f03ef96c
```

### S3 버킷처럼 내부 데이터가 있는 경우

```hcl
resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"

  # 버킷 안에 오브젝트가 있어도 삭제 허용
  force_destroy = true
}
```

---

## Terraform 자원 관리 주의사항

### State 파일 관리

```hcl
# 반드시 remote backend 사용 (S3 + DynamoDB 락)
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "playground/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "terraform-lock"
    encrypt        = true
  }
}
```

- **절대 tfstate를 직접 편집하지 말 것** — `terraform state mv`, `terraform state rm` 사용
- 팀 작업 시 DynamoDB 락 필수 — 동시 apply 방지
- tfstate에는 **시크릿(DB 패스워드 등)이 평문으로** 저장될 수 있으므로 S3 암호화 + 접근 제한

### 운영 환경 보호

```hcl
# 운영 환경 tfvars 분리
# terraform apply -var-file=prod.tfvars

# workspace로 환경 분리
terraform workspace new prod
terraform workspace select prod
```

### apply 전 습관

```bash
# 항상 plan 먼저, 교체 대상 필터링
terraform plan | grep -E "\-/\+|forces replacement|must be replaced"

# Drift 확인 (코드와 실제 인프라 차이)
terraform plan -refresh-only
```

### 체크리스트

| 항목 | 설명 |
|------|------|
| plan 저장 | `-out=tfplan` 으로 plan 파일 보관 |
| 교체 대상 확인 | `-/+` 리소스 목록 검토 |
| 데이터 백업 | AMI 스냅샷, EBS 스냅샷, DB 스냅샷 |
| 점검 시간 확보 | 교체 작업은 서비스 중단 시간 포함 일정 잡기 |
| Rollback 계획 | 실패 시 이전 AMI로 재기동 or 스냅샷 복구 절차 |
| DynamoDB 락 확인 | 이전 apply가 락을 점유 중인지 확인 |
