# 트러블슈팅 모음

실습 중 발생한 이슈와 해결 방법 기록.

---

## 1. `nerdctl --namespace k8s.io build` — buildkitd 소켓 없음

**증상**
```
ERRO[0000] `buildctl` needs to be installed and `buildkitd` needs to be running
failed to ping to host unix:///run/buildkit-k8s.io/buildkitd.sock
```

**원인**
`nerdctl --namespace k8s.io build`는 k8s.io 네임스페이스 전용 buildkitd 소켓이 필요한데 Rancher Desktop에서 비활성.

**해결**
dockerd 런타임이면 `docker build`만으로 충분. k3s가 docker를 직접 런타임으로 사용하므로 import 불필요.
```bash
docker build -t agent-be:latest .
```

---

## 2. `nerdctl --namespace k8s.io load` — containerd 소켓 없음

**증상**
```
cannot access containerd socket "/run/k3s/containerd/containerd.sock": no such file or directory
```

**원인**
Rancher Desktop dockerd 모드에서는 k3s가 자체 containerd를 사용하지 않음.

**해결**
`docker build` 이미지가 k8s에 직접 사용 가능. 소켓 확인:
```bash
kubectl get node -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}'
# docker://29.x.x
```

---

## 3. `ModuleNotFoundError: No module named 'packaging'`

**증상**
Pod CrashLoopBackOff. 로그:
```
from limits.util import LazyDependency
from packaging.version import Version
ModuleNotFoundError: No module named 'packaging'
```

**원인**
Dockerfile에서 `--prefix=/deps`로 설치 시, `packaging`이 base image에 이미 있어서 pip가 `/deps`에 설치하지 않음. runtime stage에서 `/deps`를 복사하면 `packaging` 누락.

**해결**
`--prefix` 대신 `python -m venv /venv` 방식으로 변경. venv는 완전 격리라 이 문제 없음.

---

## 4. Redis `RediSearch` 모듈 없음

**증상**
```
ValueError: Redis cannot be used as a vector database without RediSearch >=2.4
```

**원인**
`redis:7.2-alpine`은 일반 Redis라 RediSearch 모듈 없음. LangChain SemanticCache는 RediSearch 필수.

**해결**
`redis/redis-stack-server:latest`로 교체.
```yaml
image: redis/redis-stack-server:latest
environment:
  REDIS_ARGS: "--maxmemory 512mb --maxmemory-policy allkeys-lru"
```

---

## 5. SSL Certificate 오류 (회사 VPN/프록시)

**증상**
```
SSLError: certificate verify failed: self-signed certificate in certificate chain
```

**발생 위치 2곳**
- Docker 빌드 시 pip install
- 런타임 tiktoken BPE 파일 다운로드

**해결 (pip)**
```dockerfile
RUN pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org ...
```

**해결 (tiktoken)**
VPN 끄고 첫 요청 시 자동 다운로드 후 캐시됨. 이후 VPN 환경에서도 동작.

---

## 6. Kafka 연결 — pod에서 접근 불가

**증상**
Kafka worker가 connect 후 메타데이터 수신 시점에 연결 끊김.

**원인**
`KAFKA_ADVERTISED_LISTENERS`에 `localhost:9092`가 있으면, 클라이언트가 메타데이터 받은 뒤 `localhost`로 재접속 시도 → pod 입장에서 자기 자신에게 접속.

**해결**
NODE_IP(k3s 노드 IP)를 advertised listener로 설정.
```yaml
KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://${NODE_IP}:9092
```

---

## 7. `Insufficient cpu` — Pod Pending

**증상**
```
0/1 nodes are available: 1 Insufficient cpu.
```

**원인**
app(3) + celery(2) + kafka(2) = 7개 Pod × CPU request가 단일 노드 용량 초과.

**해결**
로컬 개발용으로 replicas 전부 1로 조정.

---

## 8. Ollama 모델 404

**증상**
```
ollama._types.ResponseError: model 'llama3.1' not found (status code: 404)
```

**원인**
ConfigMap에 `OLLAMA_MODEL: "llama3.1"` 이지만 실제 설치된 모델은 `llama3.1:8b-instruct-q4_K_M`.

**해결**
`ollama list`로 정확한 모델명 확인 후 ConfigMap 수정.
```yaml
OLLAMA_MODEL: "llama3.1:8b-instruct-q4_K_M"
```

---

## 9. `AttributeError: 'RedisChatMessageHistory' has no attribute 'aadd_user_message'`

**증상**
채팅 응답 후 세션 저장 단계에서 500 에러.

**원인**
설치된 `langchain-community` 버전의 `RedisChatMessageHistory`에 async 메서드(`aadd_user_message`) 없음.

**해결**
sync 메서드를 `run_in_executor`로 비동기 래핑.
```python
loop = asyncio.get_event_loop()
await loop.run_in_executor(None, history.add_user_message, user_input)
await loop.run_in_executor(None, history.add_ai_message, ai_response)
```

---

## 10. SemanticCache — OpenAI quota로 인한 앱 시작 실패

**증상**
OpenAI API key 없거나 quota 소진 시 앱 기동 자체가 실패.

**원인**
`init_semantic_cache()`에서 `embeddings.embed_query("ping")`를 호출해 연결 검증하는데, 이게 실패하면 예외 전파.

**해결**
try/except로 감싸서 실패 시 캐시 없이 동작하도록 graceful fallback.
```python
try:
    embeddings.embed_query("ping")
    set_llm_cache(cache)
except Exception as e:
    logger.warning("Semantic cache disabled: %s", e)
```
