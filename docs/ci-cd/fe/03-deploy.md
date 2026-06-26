# 배포 단계 (S3 + CloudFront)

> ← [빌드 단계](./02-build)

---

## job 전체 구성

```yaml
deploy:app:
  stage: deploy
  image:
    name: amazon/aws-cli:latest
    entrypoint: [""]             # 기본 entrypoint 비활성화
  needs:
    - job: build:app
      artifacts: true            # build job의 dist/ 파일 가져오기
  script:
    - aws s3 sync path/to/dist s3://${S3_BUCKET} --delete --region ap-northeast-2
    - aws cloudfront create-invalidation --distribution-id ${CF_DIST_ID} --paths "/*"
  environment:
    name: production
    url: https://your-app-domain.com
```

---

## Docker 이미지 — AWS CLI

```yaml
image:
  name: amazon/aws-cli:latest
  entrypoint: [""]
```

### entrypoint 오버라이드가 필요한 이유

`amazon/aws-cli` 이미지의 기본 entrypoint는 `["aws"]`로 설정되어 있다.  
이 상태에서 GitLab이 `aws` 명령 대신 다른 명령을 실행하려 하면 에러가 발생한다.

`entrypoint: [""]`로 비워주면 GitLab Runner가 `script` 블록의 명령을 직접 실행할 수 있다.

```bash
# entrypoint: ["aws"] 상태에서 발생하는 에러
/bin/sh: sh: not found
```

---

## 이전 job 산출물 참조 (needs + artifacts)

```yaml
needs:
  - job: build:app
    artifacts: true
```

- **`needs`**: deploy job이 시작될 때 반드시 build:app의 결과를 받아온다. stage 순서와 무관하게 특정 job 의존성을 명시한다.
- **`artifacts: true`**: build:app에서 정의한 `artifacts.paths`(dist/ 디렉토리)를 현재 job 작업 디렉토리에 자동으로 복원한다.

---

## S3 업로드

```bash
aws s3 sync path/to/dist s3://${S3_BUCKET} --delete --region ap-northeast-2
```

| 옵션 | 의미 |
|------|------|
| `sync` | 소스와 대상을 비교해 변경된 파일만 업로드 (전체 재업로드 아님) |
| `--delete` | dist/에 없는 파일을 S3에서 삭제. 이전 빌드의 불필요한 파일 제거 |
| `--region` | S3 버킷이 위치한 리전 명시 |

::: warning --delete 옵션 주의
`--delete`를 쓰면 S3 버킷에서 dist/에 없는 파일이 모두 삭제된다. 버킷을 다른 용도와 공유하지 않도록 한다.
:::

---

## CloudFront 캐시 무효화

```bash
aws cloudfront create-invalidation --distribution-id ${CF_DIST_ID} --paths "/*"
```

S3 업로드 후 CloudFront Edge 캐시를 무효화해야 사용자가 최신 파일을 받는다.

| 항목 | 설명 |
|------|------|
| `--distribution-id` | CloudFront Distribution ID (AWS 콘솔에서 확인) |
| `--paths "/*"` | 전체 경로 무효화. 특정 경로만 지정하면 비용 절감 가능 |

::: tip 무효화 완료 대기
`create-invalidation` 명령은 무효화 요청을 제출하고 바로 완료된다. 실제 Edge 캐시가 비워지는 데는 약 30초~3분이 소요된다. 배포 직후 바로 확인하면 이전 버전이 보일 수 있다.
:::

---

## environment 설정

```yaml
environment:
  name: production
  url: https://your-app-domain.com
```

GitLab의 **Environments** 대시보드에 배포 기록이 표시된다.

- **`name`**: 환경 이름. `production`, `staging`, `preview` 등으로 구분
- **`url`**: 배포된 앱 URL. GitLab UI에서 클릭해 바로 이동 가능

GitLab → Operate → Environments에서 배포 이력, 롤백 버튼, 실행 중인 환경을 확인할 수 있다.

---

## 배포 흐름 요약

```
build:app (dist/ 생성)
    │
    │ artifacts 전달
    ▼
deploy:app
    ├── aws s3 sync dist/ → S3 버킷
    │       ↳ 변경 파일만 업로드, 삭제된 파일 제거
    │
    └── aws cloudfront create-invalidation
            ↳ Edge 캐시 무효화 → 사용자에게 최신 버전 서빙
```

---

## 다음 단계

- [AWS 자격증명 설정 →](./04-aws-credentials)
