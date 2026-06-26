# 도메인 접속 & 보안 관리

> ← [GitLab CI 파이프라인](./05-pipeline)

---

## 내부 서비스 접속 구조

EKS 내부의 ArgoCD, Grafana, Argo Rollouts Dashboard는 기본적으로 외부 노출 없이 ClusterIP로 구성된다. 접근 방법은 목적에 따라 달라진다.

| 서비스 | 기본 서비스 타입 | 권장 접근 방법 |
|--------|----------------|----------------|
| ArgoCD | ClusterIP | 개발: port-forward / 운영: Ingress + 인증 |
| Argo Rollouts Dashboard | ClusterIP | port-forward |
| Grafana | ClusterIP | 개발: port-forward / 운영: Ingress + OAuth |
| 애플리케이션 (service-a/b) | ClusterIP | Ingress → ALB |

---

## 애플리케이션 로컬 접속 (service-a/b)

ALB 없이 로컬에서 빠르게 테스트할 때 port-forward를 사용한다.

```bash
# service-a (Spring Boot — 8080 포트)
kubectl port-forward svc/service-a-dev-active 8080:80 -n service-a-dev
# http://localhost:8080/actuator/health

# service-b (FastAPI — 8081 포트로 포워딩)
kubectl port-forward svc/service-b-dev-active 8081:80 -n service-b-dev
# http://localhost:8081/docs
```

::: warning service-b ImagePullBackOff 시 port-forward 불가
파드가 `ImagePullBackOff` 상태이면 실행 중인 파드가 없어 port-forward가 동작하지 않는다.  
CI 파이프라인을 먼저 성공시켜 ECR에 이미지를 push해야 한다.
:::

---

## 방법 1: Port Forwarding (개발/일시 접속)

kubectl의 port-forward로 로컬 포트를 클러스터 서비스에 연결한다. 별도 인프라 없이 즉시 사용 가능하다.

```bash
# ArgoCD
kubectl port-forward svc/argo-cd-argocd-server -n argocd 8080:443
# https://localhost:8080  (admin / 초기 비밀번호)

# Argo Rollouts Dashboard
kubectl port-forward svc/argo-rollouts-dashboard -n argo-rollouts 3100:3100
# http://localhost:3100

# Grafana (설치된 경우)
kubectl port-forward svc/grafana -n monitoring 3000:80
# http://localhost:3000
```

::: tip 초기 비밀번호 확인
```bash
# ArgoCD
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo

# Grafana (Helm 설치 시 기본값)
kubectl -n monitoring get secret grafana \
  -o jsonpath="{.data.admin-password}" | base64 -d && echo
```
:::

---

## 방법 2: ALB Ingress + 도메인 (운영 환경)

### 전체 구성

```
인터넷
  │  https://argocd.example.com
  ▼
Route53 (A 레코드 → ALB ALIAS)
  ▼
ALB (HTTPS:443, ACM 인증서)
  ▼
Ingress (Kubernetes)
  ▼
ClusterIP 서비스 (argocd-server, grafana)
```

### ArgoCD Ingress 예시

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-ingress
  namespace: argocd
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing       # 또는 internal
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...  # ACM 인증서
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/backend-protocol: HTTPS       # ArgoCD는 HTTPS 백엔드
spec:
  rules:
    - host: argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argo-cd-argocd-server
                port:
                  number: 443
```

### Grafana Ingress 예시

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/backend-protocol: HTTP        # Grafana는 HTTP 백엔드
spec:
  rules:
    - host: grafana.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: grafana
                port:
                  number: 80
```

### ACM 인증서 발급

```bash
# Route53 DNS 검증 방식으로 발급 (자동 갱신)
aws acm request-certificate \
  --domain-name "*.example.com" \
  --validation-method DNS \
  --region ap-northeast-2

# Route53에 CNAME 레코드 추가 (콘솔에서 확인)
# 상태가 ISSUED가 되면 Ingress annotation에 ARN 입력
```

### Route53 레코드

```bash
# ALB DNS 이름 확인 (Ingress 생성 후)
kubectl get ingress argocd-ingress -n argocd \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Route53에 A 레코드 (Alias) 추가
# 대상: 위에서 확인한 ALB DNS 이름
```

---

## 보안 설정

### 1. IP 허용 목록 (WAF / Security Group)

내부 도구(ArgoCD, Grafana)는 특정 IP에서만 접근을 허용한다.

**ALB Security Group:**
```
인바운드 규칙
443 (HTTPS) ← 회사 IP (예: 1.2.3.4/32)
443 (HTTPS) ← VPN IP 대역 (예: 10.0.0.0/8)
```

**Terraform으로 관리:**
```hcl
resource "aws_security_group_rule" "argocd_allow" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks   # tfvars로 IP 관리
  security_group_id = aws_security_group.alb.id
}
```

**WAF IP Set (ALB에 연결):**
```hcl
resource "aws_wafv2_ip_set" "internal_tools" {
  name               = "internal-tools-allowlist"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = ["1.2.3.4/32", "5.6.7.8/32"]
}
```

### 2. ArgoCD 인증

**기본 admin 계정 비활성화 (운영 환경):**

```yaml
# ArgoCD Helm values
configs:
  cm:
    admin.enabled: "false"       # admin 계정 비활성화
  params:
    server.insecure: "false"     # HTTPS 강제

# 추가 사용자 생성 (local user)
accounts.alice: apiKey, login
accounts.alice.enabled: "true"
```

**OIDC 연동 (GitLab OAuth):**
```yaml
configs:
  cm:
    url: https://argocd.example.com
    oidc.config: |
      name: GitLab
      issuer: https://gitlab.example.com
      clientID: <GitLab OAuth App ID>
      clientSecret: $oidc.gitlab.clientSecret   # Secret 참조
      requestedScopes: ["openid", "profile", "email"]
  rbac:
    policy.default: role:readonly
    policy.csv: |
      g, developer-group, role:admin   # GitLab 그룹 → ArgoCD 역할 매핑
```

### 3. Grafana 인증

```yaml
# Grafana Helm values
grafana.ini:
  server:
    root_url: https://grafana.example.com
  auth.gitlab:
    enabled: true
    client_id: <GitLab OAuth App ID>
    client_secret: <secret>
    scopes: openid profile email
    auth_url: https://gitlab.example.com/oauth/authorize
    token_url: https://gitlab.example.com/oauth/token
    api_url: https://gitlab.example.com/api/v4/user
    allowed_groups: developer-team
```

### 4. Internal-only ALB (내부 서비스)

외부 공개가 불필요한 경우 `scheme: internal`로 VPC 내부에서만 접근 가능하게 한다.

```yaml
annotations:
  alb.ingress.kubernetes.io/scheme: internal   # 퍼블릭 IP 없음
```

VPN이나 Bastion 호스트를 통해서만 접근 가능하다.

---

## 애플리케이션 도메인 구성 (service-a/b)

### values-prod.yaml

```yaml
ingress:
  enabled: true
  host: "api.example.com"
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:..."
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"    # HTTP → HTTPS 리다이렉트
    alb.ingress.kubernetes.io/healthcheck-path: "/actuator/health"
```

`ssl-redirect` annotation으로 HTTP 접근 시 자동으로 HTTPS로 리다이렉트한다.

---

## 운영 환경 도메인 구성 체크리스트

- [ ] ACM 인증서 발급 및 `ISSUED` 상태 확인
- [ ] Route53 Hosted Zone 생성 또는 기존 사용
- [ ] Ingress 생성 → ALB DNS 이름 확인
- [ ] Route53 A 레코드 (Alias) 등록
- [ ] ALB Security Group IP 제한 (내부 도구)
- [ ] ArgoCD admin 비밀번호 변경 또는 SSO 연동
- [ ] Grafana admin 비밀번호 변경 또는 SSO 연동
