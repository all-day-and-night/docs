# 사전 준비 & Bootstrap

> ← [개요로 돌아가기](./00-overview)

---

## 필수 도구

| 도구 | 설치 | 확인 |
|------|------|------|
| AWS CLI v2 | `brew install awscli` | `aws --version` |
| Terraform ≥ 1.5 | `brew install hashicorp/tap/terraform` | `terraform version` |
| kubectl | `brew install kubectl` | `kubectl version --client` |
| Helm | `brew install helm` | `helm version` |

```bash
# 한번에 확인
./scripts/00-prereq-check.sh
```

---

## AWS 자격증명 설정

```bash
aws configure
# Region: ap-northeast-2
# Output: json
```

---

## EC2 Key Pair

AWS 콘솔 → EC2 → Key Pairs → **Create key pair**
- 이름: `dex-key`
- `.pem` 저장 후 권한 설정:

```bash
chmod 400 ~/.ssh/dex-key.pem
```

::: warning 보안 주의
`.pem` 파일은 프로젝트 폴더가 아닌 `~/.ssh/` 에 보관

`.gitignore` 에 `.pem` 추가 필수
:::

---

## Bootstrap 실행 (최초 1회)

Terraform 상태 관리용 S3 버킷 + DynamoDB 테이블 생성

```bash
./scripts/01-bootstrap.sh
```

### 생성 결과

| 리소스 | 이름 |
|--------|------|
| S3 버킷 | `gitlab-eks-terraform-state-151564769076` |
| DynamoDB | `gitlab-eks-terraform-lock` |

::: info
스크립트가 Account ID를 자동으로 가져와서
`persistent/main.tf`, `eks/main.tf` 의 backend 설정에 자동 반영
:::

---

## 트러블슈팅

> [DynamoDB 생성 권한 오류](./troubleshooting#dynamodb-생성-권한-오류) 참고
