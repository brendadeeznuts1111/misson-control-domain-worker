# Mission Control Domain Worker

A monorepo Cloudflare Worker serving multiple domains from a single codebase with enterprise-grade security and observability.

## 🔐 Security Status

![Security Status](https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/badge.svg)
[![Monitoring](https://img.shields.io/badge/Monitoring-PagerDuty-00C389)](https://mission-control.pagerduty.com)
[![Deployment](https://img.shields.io/badge/Deployment-Canary_Ready-4ade80)](./hq/scripts/canary-ramp.sh)
[![Secrets](https://img.shields.io/badge/Secrets-SOPS_Encrypted-667eea)](./hq/.sops.yaml)

## 🌐 Live Domains

- **Main**: [misson-control.com](https://misson-control.com) - Landing page
- **Hub**: [hub.misson-control.com](https://hub.misson-control.com) - Developer dashboard
- **API**: [api.misson-control.com](https://api.misson-control.com) - REST API
- **Staging**: [staging.misson-control.com](https://staging.misson-control.com) - Test environment

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up secrets (first time only)
cd hq && ./scripts/encrypt-secrets.sh

# Run locally
wrangler dev

# Deploy to staging (with canary)
./scripts/canary-ramp.sh staging 10

# Deploy to production
wrangler deploy --env production
```

## ⚡ New Features (v0.4.1+)

### 🚨 PagerDuty Monitoring
- Automatic health checks every minute
- 2-minute failure threshold before alerting
- Signature validation monitoring
- Auto-resolve when service recovers

### 🚀 Progressive Canary Deployments
- Automated 10% → 50% → 100% ramp
- P95 latency monitoring
- Emergency rollback capability
- Metrics validation at each stage

### 🔐 SOPS Secret Management
- Age encryption for sensitive data
- GitHub Actions integration
- Secure key rotation workflow
- No plain text secrets in repo

## 📁 Project Structure

```
src/
├── index.ts        # Main router & domain detection
├── routes/         # Domain-specific handlers
│   ├── main.ts     # misson-control.com
│   ├── hub.ts      # hub.misson-control.com
│   ├── api.ts      # api.misson-control.com
│   └── staging.ts  # staging.misson-control.com
├── middleware/     # Shared middleware
│   ├── auth.ts     # API authentication
│   ├── cors.ts     # CORS headers
│   └── logging.ts  # Request logging
├── lib/            # Utilities
│   └── router.ts   # Routing helpers
└── types.ts        # TypeScript definitions
```

## 🔑 Environment Variables

```bash
# Set in wrangler.toml
ENVIRONMENT=production|staging

# Set via CLI (secrets)
wrangler secret put API_KEY
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
```

## 🔒 API Authentication

The API domain requires authentication. Include your API key in requests:

```bash
# Header authentication
curl -H "X-API-Key: your-key" https://api.misson-control.com/v1/users

# Bearer token
curl -H "Authorization: Bearer your-key" https://api.misson-control.com/v1/projects
```

## 📦 API Endpoints

### Health Check
- `GET /health` - API health status

### Users
- `GET /v1/users` - List all users
- `GET /v1/users/:id` - Get specific user

### Projects
- `GET /v1/projects` - List all projects

### Deployments
- `POST /v1/deployments` - Create deployment

### Metrics
- `GET /v1/metrics` - System metrics

## 🚢 Deployment

### Manual Deployment

```bash
# Production
wrangler deploy --env production

# Staging
wrangler deploy --env staging
```

### Automatic Deployment (CI/CD)

- **Push to `main`** → Deploys to staging automatically
- **Create tag `v*`** → Deploys to production automatically

```bash
# Deploy to production via tag
git tag v1.0.0
git push origin v1.0.0
```

## 🛠️ Development

### Local Development

```bash
# Start dev server (default port 8787)
wrangler dev

# With specific environment
wrangler dev --env staging

# With local mode (no Cloudflare edge)
wrangler dev --local
```

### Testing

```bash
# Run tests
npm test

# Type checking
npm run typecheck
```

### View Logs

```bash
# Production logs
wrangler tail

# Staging logs
wrangler tail --env staging
```

## 🔧 Configuration

All configuration is in `wrangler.toml`:

- **Routes**: Custom domains for each environment
- **Environment Variables**: Non-sensitive config
- **KV Namespaces**: Data storage (when needed)
- **R2 Buckets**: File storage (when needed)

## 📝 Adding New Features

### Add a New Route

1. Create handler in `src/routes/`
2. Import in `src/index.ts`
3. Add hostname detection logic

### Add a New Domain

1. Update `wrangler.toml` with new route
2. Add handler in `src/routes/`
3. Deploy: `wrangler deploy --env [environment]`

### Add Middleware

1. Create in `src/middleware/`
2. Import in `src/index.ts`
3. Add to middleware chain

## 🤝 Contributing

1. Create feature branch from `main`
2. Make changes and test locally
3. Push branch and create PR
4. Automatic staging deployment on merge
5. Tag release for production deployment

## 📜 License

Private repository - All rights reserved

## 🆘 Support

- Check logs: `wrangler tail`
- View metrics: [Cloudflare Dashboard](https://dash.cloudflare.com)
- Debug locally: `wrangler dev --local`

## 🔐 Security

### Ghost Recon: Phantom Spectrum

Mission Control HQ includes enterprise-grade security features powered by the Ghost Recon enhancement protocol:

#### Features
- **Cryptographic Signatures**: All heartbeats are SHA256 signed for integrity verification
- **Deployment Proof**: Visual cryptographic verification at `/api/ghost/proof`
- **Dead-Man Fuse**: Auto-recovery system with 5-minute KV lease
- **Audit Logging**: Compliance-grade audit trail with 30-day retention
- **Canary Deployments**: Progressive rollout with 0-100% traffic control
- **Rollback Checkpoints**: One-click recovery with authenticated snapshots

#### Security Endpoints
- `GET /api/ghost/heartbeat` - Signed heartbeat with deployment metrics
- `GET /api/ghost/proof` - Public cryptographic proof page
- `GET /api/ghost/badge.svg` - Real-time security status badge
- `POST /api/ghost/rollback` - Create rollback checkpoint (requires auth)

#### Key Rotation Runbook

1. **Generate new key pair**:
   ```bash
   openssl rand -hex 32
   ```

2. **Update staging environment**:
   ```bash
   echo "new-key-value" | wrangler secret put GHOST_SIGNATURE --env staging
   ```

3. **Validate for 24 hours** - Monitor staging metrics and alerts

4. **Update production**:
   ```bash
   echo "new-key-value" | wrangler secret put GHOST_SIGNATURE --env production
   ```

5. **Archive old keys** in password manager with rotation date

#### Security Headers Applied
- `X-Deployment-ID` - Current deployment identifier
- `X-Region-ID` - Deployment region
- `X-Content-SHA256` - Content integrity hash
- `Last-Modified-SHA` - Abbreviated content hash
- `X-Canary-Deployment` - Canary status (when active)

### Compliance & Audit

- **SOC-2 Type II**: 7-year audit log retention
- **GDPR**: Right to erasure support in KV namespaces
- **CCPA**: Data subject access request logging

### Security Contact

Report security vulnerabilities to: security@misson-control.com

---

Built with ❤️ using Cloudflare Workers | Protected by Ghost Recon 🪖