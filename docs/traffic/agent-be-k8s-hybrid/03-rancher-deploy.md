# Rancher Desktop 로컬 배포 가이드

## 사전 요구사항

- Rancher Desktop (dockerd 런타임 모드)
- kubectl
- docker-compose
- Ollama (Mac 네이티브, 선택)

## Rancher Desktop 컨테이너 런타임 확인

```bash
kubectl get node -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}'
# docker://29.x.x 이면 dockerd 모드
# containerd://... 이면 containerd 모드
```

> dockerd 모드: `docker build` 이미지가 k8s에 바로 사용 가능 (import 불필요)
> containerd 모드: `nerdctl build` 또는 `docker save | k3s ctr images import` 필요

## 배포 절차

### 1. secret.yaml 편집

```bash
vi kubernetes/secret.yaml
# OPENAI_API_KEY 입력
```

### 2. 배포 스크립트 실행

```bash
./scripts/k8s-local-deploy.sh
```

스크립트 내부 동작:
1. `kubectl config use-context rancher-desktop`
2. k3s 노드 IP 획득 → `export NODE_IP`
3. docker-compose.infra.yml 기동 (Redis Stack + Kafka)
4. Redis 헬스체크 대기
5. `docker build -t agent-be:latest .`
6. `envsubst` 로 ConfigMap의 `${NODE_IP}` 치환 후 적용
7. Secret 적용
8. Deployment / Service / HPA 적용
9. rollout status 대기

### 3. 접근

```bash
kubectl port-forward svc/agent-be 8000:80

# 헬스체크
curl http://localhost:8000/v1/health

# 채팅 (local Ollama)
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"input": "안녕하세요", "provider": "local"}'

# Swagger UI
open http://localhost:8000/docs
```

### 4. 종료

```bash
./scripts/k8s-local-teardown.sh
```

## Dockerfile 구성 포인트

### venv 방식 (--prefix 방식 대신)

```dockerfile
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"
RUN pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    fastapi ...

# runtime stage
COPY --from=builder /venv /venv
ENV PATH="/venv/bin:$PATH"
```

**`--prefix=/deps` 방식의 문제**: base image에 이미 설치된 패키지(예: `packaging`)를 pip가 skip해서 runtime에서 누락 발생.
**venv 방식**: 완전히 격리된 가상환경이므로 이 문제 없음.

### 회사 SSL 프록시 환경

```dockerfile
RUN pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org ...
```

`--trusted-host` 없으면 SSL certificate verify failed 에러 발생.

## Ollama 사용 시 주의사항

Ollama가 Mac 네이티브로 실행 중일 때:
- k8s pod에서 접근 주소: `http://192.168.5.2:11434` (Lima VM의 gateway = Mac host)
- `localhost:11434` 불가 (pod의 localhost는 자기 자신)

ConfigMap에서:
```yaml
OLLAMA_BASE_URL: "http://192.168.5.2:11434"
OLLAMA_MODEL: "llama3.1:8b-instruct-q4_K_M"  # 정확한 태그 필요
```

> `llama3.1`만 쓰면 404 에러. `ollama list`로 정확한 모델명 확인 필요.

## 자주 쓰는 명령

```bash
# Pod 상태 확인
kubectl get pods

# 로그 확인
kubectl logs -l app=agent-be --tail=50

# ConfigMap 재적용
NODE_IP=192.168.5.15 envsubst < kubernetes/configmap.yaml | kubectl apply -f -

# 이미지 재빌드 후 롤링 재시작
docker build -t agent-be:latest . && kubectl rollout restart deployment/agent-be

# 포트포워드 중인 프로세스 종료
kill $(lsof -ti :8000)

# 인프라 상태 확인
docker-compose -f docker-compose.infra.yml ps
```

## 관련 노트
- [개요 및 배포 전략](./00-overview)
- [k8s 매니페스트 구성](./01-k8s-manifests)
- [트러블슈팅 모음](./04-troubleshooting)
