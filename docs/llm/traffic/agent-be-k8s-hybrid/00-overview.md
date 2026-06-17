# 로컬 K8s 하이브리드 배포 개요

## 배경

agent-be 프로젝트를 로컬 Kubernetes(Rancher Desktop) 환경에서 운영하면서 실제 k8s 동작 방식을 학습하기 위한 실습 구성.

source repo: https://github.com/all-day-and-night/agent-be

## 하이브리드 전략

앱 컴포넌트는 k8s, 인프라는 docker-compose로 분리 운영.

```
┌─────────────────────────────────┐    ┌──────────────────────────┐
│   Rancher Desktop (k3s)         │    │  docker-compose.infra.yml │
│                                 │    │                           │
│  ┌──────────┐  ┌─────────────┐  │    │  ┌───────────────────┐   │
│  │ agent-be │  │celery-worker│  │◄───┤  │  Redis Stack      │   │
│  └──────────┘  └─────────────┘  │    │  │  (port 6379)      │   │
│  ┌─────────────┐ ┌────────────┐ │    │  └───────────────────┘   │
│  │kafka-worker │ │celery-beat │ │◄───┤  ┌───────────────────┐   │
│  └─────────────┘ └────────────┘ │    │  │  Kafka KRaft      │   │
│                                 │    │  │  (port 9092)      │   │
└─────────────────────────────────┘    │  └───────────────────┘   │
                                       └──────────────────────────┘
Mac 네이티브: Ollama (port 11434)
```

## 선택 이유

| 방식 | 장점 | 단점 |
|------|------|------|
| 완전 docker-compose | 간단 | k8s 동작 학습 불가 |
| 완전 k8s | 실환경과 동일 | Redis/Kafka k8s 구성 복잡, 리소스 무거움 |
| **하이브리드 (선택)** | 앱 k8s 동작 학습 + 인프라 간편 | 네트워크 연결 설정 필요 |

## 핵심 네트워크 이슈와 해결

### Rancher Desktop 네트워크 토폴로지
```
Mac Host (192.168.5.2 as seen from Lima)
  └── Lima VM (k3s node: 192.168.5.15)
        ├── k3s pods (10.42.x.x)
        └── docker containers (172.17.x.x)
```

### Kafka Advertised Listener 문제
Kafka 클라이언트는 bootstrap 연결 후 **메타데이터에서 받은 주소로 재접속**한다.
docker-compose 기본값 `localhost:9092`는 pod 입장에서 자기 자신이므로 실패.

**해결**: k3s 노드 IP를 NODE_IP로 주입해 광고 주소로 설정.
```yaml
KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://${NODE_IP}:9092
```

### Ollama 접근 주소
Ollama가 Mac 네이티브로 실행 중이면 Lima VM에서 `192.168.5.2:11434`로 접근.
```yaml
OLLAMA_BASE_URL: "http://192.168.5.2:11434"
```

## 관련 노트
- [k8s 매니페스트 구성](./01-k8s-manifests)
- [앱 컴포넌트 및 API](./02-app-components)
- [Rancher Desktop 배포 가이드](./03-rancher-deploy)
- [트러블슈팅 모음](./04-troubleshooting)
