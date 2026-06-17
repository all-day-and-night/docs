# CI/CD 파이프라인

> ← [개요로 돌아가기](./00-overview)
>
> 선행 조건: [Runner 등록 완료](./04-gitlab-runner)

---

## 파이프라인 흐름

```
git push → build (Docker 빌드 + ECR 푸시) → test (단위 테스트) → deploy (kubectl apply, main 브랜치만)
```

---

## 기본 .gitlab-ci.yml

```yaml
stages:
  - build
  - test
  - deploy

default:
  tags:
    - shell,ec2   # EC2 Runner 사용

build:
  stage: build
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - aws ecr get-login-password | docker login --username AWS ...
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

test:
  stage: test
  script:
    - python -m pytest tests/

deploy:
  stage: deploy
  script:
    - aws eks update-kubeconfig --region ap-northeast-2 --name gitlab-eks-dev
    - kubectl set image deployment/app app=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main
```

---

## ECR 설정 (이미지 저장소)

```bash
# ECR 리포지토리 생성
aws ecr create-repository \
  --repository-name gitlab-eks-app \
  --region ap-northeast-2

# Runner EC2에 ECR 푸시 권한 필요 (IAM Role 또는 인라인 정책)
```

---

## 파이프라인 검증 순서

1. GitLab에서 테스트 프로젝트 생성
2. `.gitlab-ci.yml` 푸시
3. GitLab → CI/CD → Pipelines 에서 실행 확인
4. Runner가 job을 pick up 하는지 확인
5. EKS가 켜진 상태에서 deploy 스테이지 확인

---

## 향후 확장 계획

```
현재:
  build → test → deploy (kubectl)

확장:
  build → test → deploy
                   └── Kubeflow Pipeline 트리거
                         └── 학습 → 평가 → KServe 배포
```

→ [Kubeflow + ML Pipeline 계획](./06-future-plan)
