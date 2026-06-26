# VPC + GitLab EC2

> ← [개요로 돌아가기](./00-overview)

---

## 생성 리소스

```
VPC (10.0.0.0/16)
├── Public Subnet x2  (10.0.1.0/24, 10.0.2.0/24)  — AZ-a, AZ-c
├── Private Subnet x2 (10.0.10.0/24, 10.0.11.0/24) — AZ-a, AZ-c
├── Internet Gateway
├── NAT Gateway (Public Subnet에 위치)
└── EC2: GitLab Omnibus (t3.large, Ubuntu 22.04)
      ├── EBS 50GB (gp3)
      ├── Elastic IP: 3.37.72.89
      └── GitLab Runner + AWS CLI + kubectl + Helm (userdata 자동 설치)
```

---

## 실행

```bash
./scripts/02-persistent.sh
```

- Key Pair 이름 입력 프롬프트: `dex-key`
- 소요 시간: ~5분 (EC2 생성) + ~10분 (GitLab 설치)

### 생성된 리소스 정보

| 항목 | 값 |
|------|-----|
| GitLab 공인 IP | `3.37.72.89` |
| VPC ID | `vpc-0a6a4c4f6c94dab56` |
| Private Subnet | `subnet-0eaad4d506e20d56d`, `subnet-05c4e4c66ba73c870` |

---

## GitLab 초기 설정

### 1. 설치 완료 확인

```bash
sudo gitlab-ctl status
# nginx, puma, sidekiq 가 run 상태여야 접속 가능
```

### 2. 초기 비밀번호 확인

```bash
ssh -i ~/.ssh/dex-key.pem ubuntu@3.37.72.89 \
  'sudo cat /etc/gitlab/initial_root_password'
```

### 3. 접속 및 설정

1. `http://3.37.72.89` 접속
2. `root` / 위 비밀번호로 로그인
3. 비밀번호 변경 (우상단 프로필 → Edit profile → Password)

---

## Terraform 구조

```
terraform/
├── modules/vpc/          ← VPC, 서브넷, IGW, NAT GW
├── modules/ec2-gitlab/   ← EC2, SG, EIP, userdata
└── envs/dev/persistent/  ← 환경 설정 (항상 켜둠)
    ├── main.tf
    ├── variables.tf
    └── terraform.tfvars
```

---

## 트러블슈팅

- [VPC 생성 권한 오류](./troubleshooting#vpc-생성-권한-오류)
- [모듈 경로 오류](./troubleshooting#모듈-경로-오류)
- [GitLab 접속 안됨](./troubleshooting#gitlab-접속-안됨)
