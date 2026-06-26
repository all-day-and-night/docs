# AWS 자격증명 설정

> ← [배포 단계](./03-deploy)

---

## GitLab CI/CD Variables 등록 위치

```
GitLab 프로젝트
  → Settings
    → CI/CD
      → Variables (Expand)
```

---

## 필요 변수 목록

| 변수명 | 설명 | Masked | Protected |
|--------|------|--------|-----------|
| `AWS_ACCESS_KEY_ID` | IAM 사용자 액세스 키 ID | ✅ | ✅ |
| `AWS_SECRET_ACCESS_KEY` | IAM 사용자 시크릿 키 | ✅ | ✅ |
| `AWS_DEFAULT_REGION` | 기본 리전 (예: `ap-northeast-2`) | | |
| `S3_BUCKET` | 배포 대상 S3 버킷 이름 | | |
| `CF_DIST_ID` | CloudFront Distribution ID | ✅ | |

---

## Masked vs Protected 차이

| 속성 | 의미 |
|------|------|
| **Masked** | 파이프라인 로그에서 값이 `[MASKED]`로 가려짐. 민감한 값은 반드시 활성화 |
| **Protected** | Protected 브랜치(main 등)에서 실행되는 파이프라인에만 노출됨. feature 브랜치에서는 사용 불가 |

::: tip Masked 조건
GitLab에서 Masked 옵션을 사용하려면 변수 값에 줄바꿈, 공백 등 특수 문자가 없어야 한다. Base64로 인코딩해 등록하는 경우도 있다.
:::

---

## IAM 최소 권한 정책

CI/CD에서 사용하는 IAM 사용자에게는 필요한 권한만 부여한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Deploy",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
    }
  ]
}
```

::: warning 광범위한 권한 지양
`s3:*` 또는 `cloudfront:*` 같은 와일드카드 권한은 부여하지 않는다. 자격증명이 노출될 경우 피해 범위를 최소화하기 위해 최소 권한 원칙을 적용한다.
:::

---

## IAM 사용자 생성 절차

```bash
# 1. IAM 사용자 생성
aws iam create-user --user-name gitlab-ci-deploy

# 2. 정책 연결 (인라인 정책 파일 사용)
aws iam put-user-policy \
  --user-name gitlab-ci-deploy \
  --policy-name FrontendDeploy \
  --policy-document file://deploy-policy.json

# 3. 액세스 키 생성
aws iam create-access-key --user-name gitlab-ci-deploy
# → AccessKeyId, SecretAccessKey 출력 → GitLab Variables에 등록
```

---

## 자격증명 동작 원리

`amazon/aws-cli` Docker 이미지는 실행 시 환경변수에서 자동으로 자격증명을 읽는다.

```
GitLab CI/CD Variables
  AWS_ACCESS_KEY_ID=AKIA...
  AWS_SECRET_ACCESS_KEY=xxx...
  AWS_DEFAULT_REGION=ap-northeast-2
         │
         ▼ (환경변수로 주입)
  Docker 컨테이너 (amazon/aws-cli)
         │
         ▼
  aws s3 sync ... (자동 인증)
```

별도의 `aws configure` 명령 없이 환경변수만으로 인증이 완료된다.

---

## CloudFront Distribution ID 확인

```bash
# AWS CLI로 확인
aws cloudfront list-distributions \
  --query "DistributionList.Items[*].{Id:Id,Domain:DomainName}" \
  --output table
```

또는 AWS 콘솔 → CloudFront → 배포 목록에서 **Distribution ID** 컬럼 값을 확인한다.
