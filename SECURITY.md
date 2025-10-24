# Security Policy

## 🔐 Security Features

Mission Control implements enterprise-grade security through the **Ghost Recon: Phantom Spectrum** protocol.

### Current Security Status

![Security Status](https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/badge.svg)

- **Live Proof**: https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/proof
- **Heartbeat**: https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat

## 🛡️ Security Architecture

### 1. Cryptographic Integrity
- **SHA256 Signatures**: All heartbeats are cryptographically signed
- **Content Verification**: `X-Content-SHA256` headers on all responses
- **Signature Validation**: Real-time verification at `/api/ghost/proof`

### 2. Secret Management
- **SOPS Encryption**: All secrets encrypted with age
- **Key Rotation**: Automated rotation workflow
- **CI/CD Security**: Secrets decrypted only during deployment
- **Zero Plain Text**: No unencrypted secrets in repository

### 3. Access Control
- **JWT Authentication**: Signed tokens with expiration
- **API Key Management**: Hashed storage in KV
- **Rate Limiting**: Per-IP and per-key limits
- **CORS Protection**: Strict origin validation

### 4. Monitoring & Alerting
- **PagerDuty Integration**: 24/7 incident response
- **Health Monitoring**: Every 30 seconds
- **Signature Validation**: Continuous verification
- **Dead-Man Switch**: 5-minute auto-recovery

### 5. Audit & Compliance
- **Append-Only Logs**: Tamper-proof audit trail
- **30-Day Retention**: Compliance-ready storage
- **SOC-2 Ready**: Full activity logging
- **GDPR Compliant**: Data erasure support

## 🔑 Secret Management

### Setting Up Secrets

1. **Install SOPS and age**:
```bash
brew install sops age
```

2. **Generate age key** (first time only):
```bash
age-keygen -o ~/.config/sops/age/keys.txt
```

3. **Encrypt secrets**:
```bash
cd hq
cp .env.example .env
# Edit .env with your secrets
./scripts/encrypt-secrets.sh
```

4. **Add to GitHub Secrets**:
```bash
# Get your age secret key
cat ~/.config/sops/age/keys.txt | grep AGE-SECRET-KEY

# Add to GitHub
gh secret set SOPS_AGE_KEY --body "YOUR-AGE-SECRET-KEY"
```

### Key Rotation

1. **Generate new key**:
```bash
openssl rand -hex 32
```

2. **Update staging first**:
```bash
echo "new-key" | wrangler secret put GHOST_SIGNATURE --env staging
```

3. **Monitor for 24 hours**

4. **Update production**:
```bash
echo "new-key" | wrangler secret put GHOST_SIGNATURE --env production
```

5. **Archive old key** with timestamp

## 🚨 Incident Response

### Severity Levels

| Level | Response Time | Examples |
|-------|--------------|----------|
| P1 - Critical | < 15 min | Signature validation failure, auth bypass |
| P2 - High | < 1 hour | Rate limit bypass, audit log failure |
| P3 - Medium | < 4 hours | Slow response times, canary issues |
| P4 - Low | < 24 hours | Documentation issues, minor bugs |

### Response Procedures

#### 1. Immediate Actions (P1/P2)
```bash
# Create checkpoint
curl -X POST https://api.mission-control.com/api/ghost/rollback \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -d '{"note":"incident-checkpoint"}'

# Disable canary
./scripts/canary-ramp.sh production 0

# Check logs
wrangler tail --env production --search "error"
```

#### 2. Investigation
- Review audit logs in KV
- Check PagerDuty alerts
- Analyze metrics in `/api/ghost/heartbeat`
- Review recent deployments

#### 3. Remediation
- Apply fix to staging first
- Run security validation
- Progressive canary deployment
- Monitor for 24 hours

## 🔍 Security Monitoring

### Automated Checks
- **Health Monitoring**: Every 30 seconds via cron
- **Signature Validation**: On every heartbeat
- **Rate Limit Monitoring**: Real-time enforcement
- **Dead-Man Fuse**: 5-minute timeout

### Manual Validation
```bash
# Verify signature
curl -s https://api.mission-control.com/api/ghost/heartbeat | \
  jq -r '.signature' | cut -d: -f1

# Check security headers
curl -I https://api.mission-control.com/api/ghost/proof | \
  grep -E "X-Content-SHA256|X-Deployment-ID"

# Validate rate limits
for i in {1..25}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    https://api.mission-control.com/api/health
done
```

## 🐛 Vulnerability Reporting

### Responsible Disclosure

We take security seriously and appreciate responsible disclosure of vulnerabilities.

1. **DO NOT** create public GitHub issues for security vulnerabilities
2. **Email**: security@misson-control.com
3. **PGP Key**: Available at https://mission-control.com/.well-known/pgp-key.asc
4. **Response Time**: Within 48 hours

### Scope

In scope for security reports:
- Authentication bypass
- Signature forgery
- Rate limit bypass
- Data exposure
- Injection vulnerabilities
- CORS misconfiguration

Out of scope:
- Denial of Service attacks
- Social engineering
- Physical attacks
- Third-party services

### Rewards

We offer recognition for valid security reports:
- Critical: $500-1000
- High: $250-500
- Medium: $100-250
- Low: Acknowledgment

## 📋 Security Checklist

### Pre-Deployment
- [ ] All secrets encrypted with SOPS
- [ ] No hardcoded credentials
- [ ] Rate limiting configured
- [ ] CORS headers set correctly
- [ ] Authentication required on sensitive endpoints

### Post-Deployment
- [ ] Verify signature generation
- [ ] Test rate limits
- [ ] Check audit logging
- [ ] Validate PagerDuty alerts
- [ ] Monitor error rates

### Weekly
- [ ] Review audit logs
- [ ] Check for unusual patterns
- [ ] Validate backup procedures
- [ ] Test incident response
- [ ] Update dependencies

### Monthly
- [ ] Rotate secrets
- [ ] Security patch review
- [ ] Pen-test preparation
- [ ] Compliance audit
- [ ] Team training

## 🔒 Compliance

### SOC-2 Type II
- ✅ Audit logging (30-day retention)
- ✅ Access controls
- ✅ Encryption at rest
- ✅ Monitoring and alerting
- ✅ Incident response procedures

### GDPR
- ✅ Data minimization
- ✅ Right to erasure
- ✅ Data portability
- ✅ Privacy by design
- ✅ Breach notification (72 hours)

### CCPA
- ✅ Data inventory
- ✅ Access request handling
- ✅ Opt-out mechanisms
- ✅ Data deletion
- ✅ Non-discrimination

## 📚 Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Cloudflare Security Best Practices](https://developers.cloudflare.com/workers/platform/security/)

## 🆘 Emergency Contacts

- **On-Call Engineer**: Via PagerDuty
- **Security Team**: security@misson-control.com
- **Platform Team**: platform@misson-control.com
- **Cloudflare Support**: https://dash.cloudflare.com/support

---

*Last Updated: v0.4.1 | Ghost Recon: Phantom Spectrum*