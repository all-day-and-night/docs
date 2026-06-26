# 빌드 단계 (pnpm + Turbo)

> ← [파이프라인 구성](./01-pipeline)

---

## job 전체 구성

```yaml
build:app:
  stage: build
  interruptible: true             # 새 커밋 시 자동 취소 허용
  image:
    name: node:24-slim
    pull_policy: if-not-present   # Runner에 이미지가 있으면 재사용
  cache:
    key:
      files:
        - pnpm-lock.yaml          # lockfile 변경 시 캐시 무효화
    paths:
      - .pnpm-store/
      - .turbo/cache/
    policy: pull-push             # 캐시를 읽고 job 후 갱신
  before_script:
    - corepack enable
    - corepack prepare pnpm@${PNPM_VERSION} --activate
    - pnpm config set store-dir ${PNPM_STORE_DIR}
  script:
    - pnpm install --frozen-lockfile --prefer-offline
    - pnpm turbo run build --filter=@scope/package-name --cache-dir=${TURBO_CACHE_DIR}
  artifacts:
    paths:
      - path/to/dist/
    expire_in: 1 hour
```

---

## Docker 이미지 선택

```yaml
image:
  name: node:24-slim
  pull_policy: if-not-present
```

- **`node:24-slim`**: 풀 이미지 대비 크기가 작아 빌드 시작 시간이 빠르다. 빌드에 필요한 도구는 대부분 포함되어 있다.
- **`pull_policy: if-not-present`**: Runner 호스트에 이미지가 이미 있으면 Docker Hub에서 다시 받지 않는다. 네트워크 비용과 시간을 절약한다.

---

## pnpm 버전 고정 (corepack)

```yaml
before_script:
  - corepack enable
  - corepack prepare pnpm@${PNPM_VERSION} --activate
  - pnpm config set store-dir ${PNPM_STORE_DIR}
  - pnpm store path   # 경로 확인 로그 (옵션)
```

Node.js 16.9+부터 내장된 `corepack`으로 pnpm 버전을 고정한다.

| 방법 | 특징 |
|------|------|
| `npm install -g pnpm` | 버전 고정 어려움, 전역 설치 필요 |
| `corepack` | `package.json`의 `packageManager` 필드와 연동, 버전 보장 |

`pnpm config set store-dir`로 캐시 경로를 명시적으로 지정해야 GitLab 캐시가 올바른 경로를 대상으로 한다.

---

## 의존성 설치

```yaml
script:
  - pnpm install --frozen-lockfile --prefer-offline
```

| 옵션 | 의미 |
|------|------|
| `--frozen-lockfile` | `pnpm-lock.yaml`과 다르면 설치 실패. CI 환경에서 의도치 않은 버전 변경 방지 |
| `--prefer-offline` | 이미 store에 있는 패키지는 네트워크 요청 없이 사용. 캐시 히트율 향상 |

---

## Turbo 모노레포 빌드

```yaml
script:
  - pnpm turbo run build --filter=@scope/package-name --cache-dir=${TURBO_CACHE_DIR}
```

- **`--filter`**: 모노레포에서 특정 패키지만 빌드한다. 의존 패키지가 있으면 자동으로 함께 빌드한다.
- **`--cache-dir`**: Turbo의 빌드 캐시 저장 위치. GitLab 캐시 경로와 일치시켜 캐시가 유지되도록 한다.

```
@scope/package-name
  └─ depends on @scope/shared-ui
       └─ Turbo가 자동으로 @scope/shared-ui도 빌드
```

---

## 캐시 전략

```yaml
cache:
  key:
    files:
      - pnpm-lock.yaml       # lockfile 해시를 캐시 키로 사용
  paths:
    - .pnpm-store/           # pnpm 패키지 저장소
    - .turbo/cache/          # Turbo 빌드 캐시
  policy: pull-push
```

| 항목 | 설명 |
|------|------|
| 캐시 키 | `pnpm-lock.yaml` 내용이 바뀌면 새 캐시 생성 |
| `.pnpm-store/` | 패키지 바이너리 캐시 → `pnpm install` 시간 단축 |
| `.turbo/cache/` | 소스 변경이 없는 패키지는 Turbo가 캐시에서 복원 |
| `policy: pull-push` | job 시작 시 캐시 다운로드, 종료 시 갱신 업로드 |

::: tip 캐시 히트 확인
`pnpm install` 로그에 `Already up to date`, Turbo 로그에 `cache hit` 메시지가 보이면 캐시가 정상적으로 작동하는 것이다.
:::

---

## artifacts — 다음 stage로 전달

```yaml
artifacts:
  paths:
    - path/to/dist/
  expire_in: 1 hour
```

- **`paths`**: deploy stage에서 사용할 빌드 결과물 경로. `dist/` 하위 파일만 포함한다.
- **`expire_in: 1 hour`**: deploy job이 완료되면 필요 없으므로 1시간 후 자동 삭제. GitLab 저장소 용량 절약.

deploy job에서는 `needs` 키워드로 이 artifact를 참조한다.

---

## 다음 단계

- [배포 단계 →](./03-deploy)
