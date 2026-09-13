# Chatrooms101 — AWS Provisioning Guide

Order matters: network → data stores → cluster → edge → identity → deploy.
Commands use the AWS CLI; in a real org, capture the same resources in
Terraform/CDK — the parameters below are the spec.

## 0. Prereqs
- AWS CLI v2 + `eksctl` + `kubectl` + `helm`
- A Route 53 hosted zone for `chatrooms101.com`

## 1. Network
One VPC, 3 AZs, public subnets (ALB/NAT) + private subnets (everything else).
`eksctl` (next step) can create this; tag private subnets
`kubernetes.io/role/internal-elb=1`, public `kubernetes.io/role/elb=1`.

## 2. Data stores (all in private subnets, SGs allow only the EKS node SG)

### RDS PostgreSQL 16
```bash
aws rds create-db-instance \
  --db-instance-identifier chatrooms-pg \
  --engine postgres --engine-version 16.3 \
  --db-instance-class db.r6g.large \
  --allocated-storage 100 --storage-type gp3 \
  --multi-az --storage-encrypted \
  --master-username chatrooms --manage-master-user-password \
  --backup-retention-period 7 \
  --enable-performance-insights
```
- Add 1–2 **read replicas** when feed/history read load warrants.
- Connection budget: pods × pool size must stay under `max_connections`;
  that's PgBouncer's job (§6).

### ElastiCache Redis 7
```bash
aws elasticache create-replication-group \
  --replication-group-id chatrooms-redis \
  --replication-group-description "cache+pubsub+queues" \
  --engine redis --engine-version 7.1 \
  --cache-node-type cache.r7g.large \
  --num-cache-clusters 2 --automatic-failover-enabled \
  --at-rest-encryption-enabled
```
- Start non-clustered (the Lua scripts use multi-key ops on per-room keys;
  keys share a room, so if you later enable cluster mode, add hash tags
  `cr:room:{roomId}` style so a room's keys co-locate — the key layout in
  RedisService already groups by room id, making that a mechanical change).

### OpenSearch Service
```bash
aws opensearch create-domain \
  --domain-name chatrooms-search \
  --engine-version OpenSearch_2.13 \
  --cluster-config InstanceType=r6g.large.search,InstanceCount=3,ZoneAwarenessEnabled=true \
  --ebs-options EBSEnabled=true,VolumeType=gp3,VolumeSize=100 \
  --node-to-node-encryption-options Enabled=true \
  --encryption-at-rest-options Enabled=true
```

### S3 + CloudFront (media + static)
```bash
aws s3api create-bucket --bucket chatrooms-media
aws s3api put-public-access-block --bucket chatrooms-media \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```
- CloudFront distribution with **two origins**:
  - `chatrooms-media.s3` via Origin Access Control (bucket stays private)
  - the ALB, with a cache behavior for `/_next/static/*` (honors the
    `immutable` headers Nginx/Next set); default behavior: no caching.
- Uploads go browser → S3 via presigned PUT from the API (never through pods).

## 3. EKS
```bash
eksctl create cluster \
  --name chatrooms --region us-east-1 --version 1.30 \
  --nodegroup-name apps --node-type m6g.large \
  --nodes 3 --nodes-min 3 --nodes-max 12 \
  --node-private-networking --with-oidc
```
Install cluster add-ons:
```bash
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/aws-load-balancer-type"=nlb
helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set installCRDs=true
helm install metrics-server metrics-server/metrics-server -n kube-system   # HPA needs it
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
```
NLB → ingress-nginx keeps the WebSocket behavior identical to the
`infra/nginx` policy (ingress annotations in `infra/k8s/base/ingress.yaml`).

## 4. DNS + TLS
- ACM cert on CloudFront's domain; cert-manager (Let's Encrypt) for the
  ingress host.
- Route 53: `chatrooms101.com` → CloudFront; CloudFront's ALB origin →
  the NLB hostname of ingress-nginx.

## 5. Identity (IRSA — no static AWS keys in pods)
```bash
eksctl create iamserviceaccount \
  --cluster chatrooms --namespace chatrooms-prod --name api \
  --attach-policy-arn arn:aws:iam::<acct>:policy/chatrooms-s3-media \
  --approve
```
`chatrooms-s3-media` grants `s3:PutObject/GetObject` on
`arn:aws:s3:::chatrooms-media/*` only. With IRSA, leave `S3_ACCESS_KEY` /
`S3_SECRET_KEY` unset — the SDK picks up the role automatically
(the env schema already makes them optional).
Secrets (`DATABASE_URL`, JWT, Google) live in **Secrets Manager**, synced
into the `chatrooms-secrets` k8s Secret by External Secrets Operator.

## 6. PgBouncer
Run in-cluster (`pgbouncer.yaml` here) in transaction mode; pods'
`DATABASE_URL` points at it:
```
postgresql://chatrooms:***@pgbouncer.chatrooms-prod:6432/chatrooms?pgbouncer=true&connection_limit=10
```
`pgbouncer=true` disables Prisma's prepared statements (required in
transaction pooling mode).

## 7. Deploy
```bash
aws ecr create-repository --repository-name chatrooms/api   # + web, migrate
# then push (CI does this — .github/workflows/deploy.yml) and:
kubectl apply -k infra/k8s/overlays/prod
```

## Cost-conscious starting point
Everything above at the listed sizes lands around $700–900/mo. To start
smaller: single-AZ RDS db.t4g.medium, 1-node OpenSearch t3.small.search,
cache.t4g.small, 2 × t3.medium nodes — ~$150/mo, same architecture.
