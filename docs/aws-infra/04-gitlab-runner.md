# GitLab Runner 설정

> ← [개요로 돌아가기](./00-overview)
>
> 선행 조건: [GitLab EC2 설치 완료](./02-vpc-gitlab) + GitLab 초기 설정 완료

---

## 아키텍처 결정: Runner를 EC2에 설치한 이유

```
❌ Runner on EKS Pod
  → EKS가 꺼져 있으면 파이프라인 실행 불가

✅ Runner on GitLab EC2 (Shell Executor)
  → EKS 온오프와 무관하게 CI/CD 항상 동작
  → kubectl/helm 명령으로 EKS에 배포 명령만 전달
```

---

## Runner 등록

### 1. GitLab에서 Token 발급

```
GitLab 접속 (http://3.37.72.89)
→ Admin Area (좌측 상단 렌치 아이콘)
→ CI/CD → Runners
→ New instance runner
→ Token 복사 (glrt-...)
```

### 2. 자동 등록 스크립트

```bash
./scripts/06-register-runner.sh ~/.ssh/dex-key.pem
# Runner token 입력 프롬프트 등장
```

### 3. 수동 등록 (참고)

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url http://3.37.72.89 \
  --token glrt-xxxxxxxxxxxx \
  --executor shell \
  --description "ec2-shell-runner" \
  --tag-list "shell,ec2"
```

---

## 등록 확인

```bash
sudo gitlab-runner status
sudo gitlab-runner list
```

---

## EKS kubeconfig 연결

Runner가 `kubectl` 명령을 사용하려면 kubeconfig 설정 필요:

```bash
# EC2에서 실행
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name gitlab-eks-dev

kubectl get nodes  # 연결 확인
```

::: info
`scripts/06-register-runner.sh` 실행 시 kubeconfig 설정 여부를 자동으로 물어봄
:::

---

## EC2에 설치된 도구 (userdata 자동 설치)

| 도구 | 용도 |
|------|------|
| `gitlab-runner` | 파이프라인 실행 |
| `aws` CLI | ECR 로그인, EKS kubeconfig |
| `kubectl` | K8s 리소스 배포 |
| `helm` | Helm chart 배포 |
