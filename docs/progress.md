# AWS EKS + LLM 인프라 구축 진행상황

> ← [전체 아키텍처 보기](./aws-infra/00-overview)

---

## ✅ Done

### Phase 1 — Terraform Bootstrap
- [x] S3 버킷 생성 (`gitlab-eks-terraform-state-151564769076`)
- [x] DynamoDB 테이블 생성 (`gitlab-eks-terraform-lock`)
- [x] `creator` 태그 IAM 정책 대응 완료

### Phase 2 — VPC
- [x] VPC 생성 (`10.0.0.0/16`, ap-northeast-2)
- [x] Public Subnet x2 (AZ-a, AZ-c)
- [x] Private Subnet x2 (AZ-a, AZ-c)
- [x] Internet Gateway, NAT Gateway, Route Table 구성

### Phase 3 — GitLab EC2
- [x] EC2 생성 (t3.large, Ubuntu 22.04, EBS 50GB)
- [x] EIP 할당 (`3.37.72.89`)
- [x] GitLab EE Omnibus 설치 완료
- [x] GitLab 웹 UI 접근 확인
- [x] root 초기 비밀번호 설정

### Phase 4 — 도메인 & SSL
- [x] Route 53 Hosted Zone 확인 (`dex-playground.com`)
- [x] Terraform으로 A 레코드 생성 (`gitlab.dex-playground.com → 3.37.72.89`)
- [x] `gitlab.rb` `external_url` HTTPS로 변경
- [x] Let's Encrypt SSL 인증서 발급 완료
- [x] `https://gitlab.dex-playground.com` 접속 확인

### Phase 5 — GitLab Runner
- [x] EC2에 GitLab Runner 설치 (userdata 포함)
- [x] Runner 등록 완료 (Shell Executor, `ec2-shell-runner`)
  ```bash
  sudo gitlab-runner register \
    --non-interactive \
    --url "https://gitlab.dex-playground.com" \
    --token "glrt-..." \
    --executor "shell" \
    --description "ec2-shell-runner"
  ```

---

## 📋 Todo

### Phase 5 — GitLab Runner (마무리)
- [ ] Runner 태그 설정 (GitLab UI → Admin → Runners → Edit → `shell, ec2, deploy`)
- [ ] 테스트 파이프라인 동작 확인
  ```yaml
  test-runner:
    tags: [shell]
    script:
      - echo "Runner works!"
      - aws --version
  ```

### Phase 6 — EKS 클러스터
- [ ] `terraform/envs/dev/eks/` apply
  ```bash
  cd terraform/envs/dev/eks
  terraform init && terraform apply
  ```
- [ ] kubectl 접근 확인
  ```bash
  aws eks update-kubeconfig --region ap-northeast-2 --name gitlab-eks-dev
  kubectl get nodes
  ```
- [ ] Runner EC2에서 kubeconfig 설정

### Phase 7 — CI/CD 파이프라인
- [ ] `.gitlab-ci.yml` 작성 (build → test → deploy 스테이지)
- [ ] Runner가 kubectl/helm으로 EKS에 배포하는 파이프라인 검증
- [ ] 샘플 앱 EKS 배포 테스트

### Phase 8 — 서브도메인 확장 (서비스 개발 시)
- [ ] `agent-be.dex-playground.com` → EKS ALB (ACM 와일드카드 인증서)
- [ ] `agent-fe.dex-playground.com` → S3 + CloudFront
- [ ] `docs.dex-playground.com` → S3 + CloudFront

### Phase 9 — LLM 서비스 (추후)
- [ ] 엔진 결정: vLLM vs Ollama
- [ ] GPU 노드그룹 추가 (g4dn.xlarge, SPOT)
- [ ] LLM Helm chart 작성 및 배포
- [ ] API 엔드포인트 노출 (ALB Ingress)

---

## 현재 인프라 상태

```
✅ S3 + DynamoDB  (terraform state)
✅ VPC            (10.0.0.0/16, ap-northeast-2)
✅ EC2 GitLab     (t3.large, 3.37.72.89)
✅ Route 53       (gitlab.dex-playground.com → A 레코드)
✅ SSL            (Let's Encrypt, https://gitlab.dex-playground.com)
✅ GitLab Runner  (Shell Executor, ec2-shell-runner)
⬜ EKS Cluster    (미생성 — 필요 시 terraform apply)
```

::: tip 비용 현황
EKS OFF 상태 → 월 ~$95 (EC2 + NAT GW)

EKS ON 시 → 월 ~$210
:::

---

## 트러블슈팅 이력

| 날짜 | 문제 | 해결 |
|------|------|------|
| 2026-06-06 | DynamoDB RequireCreatorTag 오류 | `creator` 태그 추가 |
| 2026-06-06 | VPC RequireCreatorTag 오류 | `locals.tags`에 `creator` 추가 후 모듈 상속 |
| 2026-06-06 | 모듈 경로 오류 (`../../modules`) | `../../../modules`로 수정 |
| 2026-06-06 | GitLab 접속 불가 | cloud-init 완료까지 대기 (~10분) |
| 2026-06-06 | Route 53 Hosted Zone 2개 생성 | 도메인 등록 시 자동 생성된 Zone 사용, 수동 생성 Zone 삭제 후 terraform state 재연결 |
| 2026-06-06 | `gitlab-ctl reconfigure` external_url 오류 | gitlab.rb 중복 항목 제거 후 재실행 |
| 2026-06-06 | Runner register `--tag-list` 오류 | `glrt-` 토큰은 서버에서 태그 설정, CLI 옵션 제거 |
