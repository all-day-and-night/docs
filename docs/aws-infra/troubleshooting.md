# 트러블슈팅

> ← [개요로 돌아가기](./00-overview)

---

## DynamoDB 생성 권한 오류

**오류 메시지**
```
AccessDeniedException: User: arn:aws:iam::151564769076:user/dex.ju
is not authorized to perform: dynamodb:CreateTable
with an explicit deny in an identity-based policy: RequireCreatorTag-creator=your_full_IAM
```

**원인**
계정 IAM 정책이 리소스 생성 시 `creator` 태그를 강제함

**해결**
`terraform/bootstrap/main.tf` DynamoDB 리소스에 태그 추가:

```hcl
resource "aws_dynamodb_table" "terraform_lock" {
  # ...
  tags = {
    creator = "dex.ju"
  }
}
```

---

## VPC 생성 권한 오류

**오류 메시지**
```
UnauthorizedOperation: You are not authorized to perform: ec2:CreateVpc
with an explicit deny: RequireCreatorTag-creator=your_full_IAM
```

**원인**
DynamoDB와 동일 — 모든 리소스 생성 시 `creator` 태그 필요

**해결**
`envs/dev/persistent/main.tf` 의 `locals.tags` 에 추가:

```hcl
locals {
  tags = {
    Project     = var.project_name
    Environment = var.env
    ManagedBy   = "terraform"
    creator     = var.iam_username  # "dex.ju"
  }
}
```

→ `modules/vpc`, `modules/ec2-gitlab` 의 모든 리소스가 `merge(var.tags, {...})` 패턴으로 태그를 상속받음

::: tip
새 모듈 추가 시에도 반드시 `creator` 태그가 포함된 `var.tags` 를 전달해야 함
:::

---

## 모듈 경로 오류

**오류 메시지**
```
Unable to evaluate directory symlink: lstat ../../modules: no such file or directory
```

**원인**
`terraform/envs/dev/persistent/` 기준으로 `../../modules` 는
`terraform/envs/modules/` 를 가리켜 존재하지 않음

**해결**
경로를 세 단계 위로 수정:

```hcl
# 잘못된 경로
source = "../../modules/vpc"

# 올바른 경로
source = "../../../modules/vpc"
```

**경로 계산**
```
persistent/ → dev/ → envs/ → terraform/
```
→ 세 번 올라가야 `terraform/modules/` 에 도달

---

## GitLab 접속 안됨

**증상**
`http://3.37.72.89` 접속 시 "연결을 거부했습니다"

**원인**
EC2 userdata 스크립트로 GitLab 설치 중 (`cloud-init status: running`)  
nginx/puma 서비스가 아직 시작되지 않은 상태

**확인 방법**
```bash
sudo gitlab-ctl status
# nginx, puma, sidekiq 가 run 상태여야 함
```

**해결**
`gitlab-ctl reconfigure` 완료까지 약 5~10분 대기  
아래 서비스가 모두 `run:` 상태가 되면 접속 가능:

```
run: nginx
run: puma
run: sidekiq
run: postgresql
run: redis
run: gitaly
```
