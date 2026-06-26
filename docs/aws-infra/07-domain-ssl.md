# 도메인 & SSL 설정

> ← [개요로 돌아가기](./00-overview)

---

## 도메인 구조

```
dex-playground.com (Route 53)
├── gitlab      → EC2 3.37.72.89        (A 레코드 / Let's Encrypt)
├── agent-be    → EKS ALB               (CNAME / ACM)     ← EKS 올릴 때
├── agent-fe    → CloudFront            (CNAME / ACM)     ← 서비스 개발 때
└── docs        → CloudFront            (CNAME / ACM)     ← 서비스 개발 때
```

---

## Phase 1 — GitLab 도메인 연결 (완료 ✅)

### Terraform으로 Route 53 관리

`terraform/envs/dev/persistent/main.tf` 에 추가:

```hcl
data "aws_route53_zone" "main" {
  name = "dex-playground.com"
}

resource "aws_route53_record" "gitlab" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "gitlab.dex-playground.com"
  type    = "A"
  ttl     = 300
  records = [module.ec2_gitlab.public_ip]
}
```

**적용:**
```bash
cd terraform/envs/dev/persistent
terraform apply
```

### GitLab SSL 설정

DNS 전파 확인 후 EC2에서:

```bash
sudo vim /etc/gitlab/gitlab.rb
```

```ruby
external_url 'https://gitlab.dex-playground.com'
letsencrypt['enable'] = true
letsencrypt['contact_emails'] = ['jwug0821@gmail.com']
```

```bash
sudo gitlab-ctl reconfigure
```

**확인:** `https://gitlab.dex-playground.com` 접속

::: info DNS 전파 시간
A 레코드 추가 후 TTL(300초) 기다린 후 reconfigure 실행

`nslookup gitlab.dex-playground.com` 으로 전파 확인 가능
:::

---

## Phase 2 — EKS 서비스 도메인 (EKS 올릴 때)

### ACM 와일드카드 인증서

```hcl
# terraform/envs/dev/eks/main.tf 에 추가 예정
resource "aws_acm_certificate" "wildcard" {
  domain_name       = "*.dex-playground.com"
  validation_method = "DNS"
}
```

- 와일드카드 1개로 모든 서브도메인 커버
- EKS ALB Ingress에 annotation으로 연결

### agent-be (EKS + ALB)

```hcl
resource "aws_route53_record" "agent_be" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "agent-be.dex-playground.com"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.eks_alb.dns_name]
}
```

---

## Phase 3 — 정적 서비스 도메인 (서비스 개발 때)

### agent-fe / docs (S3 + CloudFront)

SPA와 정적 파일은 EKS 대신 S3 + CloudFront 사용

| 항목 | EKS Ingress | S3 + CloudFront |
|------|-------------|-----------------|
| 비용 | 노드 리소스 소비 | ~$1/월 이하 |
| 배포 | kubectl | `aws s3 sync` |
| CDN | 별도 설정 | 기본 제공 |
| EKS 의존 | O | X |

```bash
# CI/CD 배포 명령
aws s3 sync dist/ s3://agent-fe.dex-playground.com --delete
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

```hcl
resource "aws_route53_record" "agent_fe" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "agent-fe.dex-playground.com"
  type    = "CNAME"
  ttl     = 300
  records = [aws_cloudfront_distribution.agent_fe.domain_name]
}
```
