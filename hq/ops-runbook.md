# Ghost Recon Operations Runbook

## 🚨 On-Call CLI Cheat Sheet

### Health Monitoring

```bash
# Check heartbeat status
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat | jq

# Verify signature
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat | \
  jq -r '.signature' | cut -d: -f1

# Check dead-man fuse status
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/badge.svg | \
  grep -o "Operational\|Degraded\|Outage"
```

### Deployment Management

```bash
# Create manual checkpoint before risky deploy
curl -X POST https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/rollback \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"pre-v0.5.0-schema-migration"}'

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Canary Management

```bash
# Check current canary percentage (staging)
wrangler kv:key get CANARY_PERCENT --env staging --binding DEAD_MAN_FUSE

# Update canary percentage (staging)
echo "25" | wrangler kv:key put CANARY_PERCENT --env staging --binding DEAD_MAN_FUSE

# Promote canary to 50%
echo "50" | wrangler kv:key put CANARY_PERCENT --env staging --binding DEAD_MAN_FUSE

# Full canary rollout (100%)
echo "100" | wrangler kv:key put CANARY_PERCENT --env staging --binding DEAD_MAN_FUSE

# Emergency rollback to 0%
echo "0" | wrangler kv:key put CANARY_PERCENT --env production --binding DEAD_MAN_FUSE
```

### Secret Management

```bash
# Rotate JWT secret
openssl rand -hex 32 | wrangler secret put JWT_SECRET --env production

# Rotate Ghost signature key
openssl rand -hex 32 | wrangler secret put GHOST_SIGNATURE --env production

# List all secrets (names only)
wrangler secret list --env production
```

### Audit Log Queries

```bash
# View recent audit entries
wrangler kv:key list --env production --binding AUDIT_LOG --prefix "audit:"

# Get specific audit entry
wrangler kv:key get "audit:1234567890:abc123" --env production --binding AUDIT_LOG

# Count audit entries in last hour
wrangler kv:key list --env production --binding AUDIT_LOG --prefix "audit:$(date -u -v-1H +%s)"
```

### Monitoring & Alerts

```bash
# Continuous heartbeat monitoring
while true; do
  STATUS=$(curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat | \
    jq -r '.heartbeat.status')
  echo "[$(date)] Status: $STATUS"
  [ "$STATUS" != "healthy" ] && echo "ALERT: Unhealthy status detected!"
  sleep 30
done

# Check rate limit headers
curl -I https://mission-control-hq-production.utahj4754.workers.dev/api/health 2>/dev/null | \
  grep -E "X-RateLimit"

# Monitor error rate
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat | \
  jq '.heartbeat.metrics.errors'
```

### Troubleshooting

```bash
# View live logs
wrangler tail --env production

# View staging logs with filter
wrangler tail --env staging --search "error"

# Check worker status
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback --env production --message "Emergency rollback"

# Clear KV namespace (CAREFUL!)
wrangler kv:key list --env production --binding DEAD_MAN_FUSE | \
  xargs -I {} wrangler kv:key delete {} --env production --binding DEAD_MAN_FUSE
```

### Performance Metrics

```bash
# Capture p95 latency baseline
for i in {1..100}; do
  curl -w "%{time_total}\n" -o /dev/null -s \
    https://mission-control-hq-production.utahj4754.workers.dev/api/health
done | sort -n | awk 'NR==95{print "P95 Latency: " $1 * 1000 "ms"}'

# Compare canary vs stable performance
# (Run with different X-Canary-Group headers)
curl -H "X-Canary-Group: canary" -w "%{time_total}\n" -o /dev/null -s \
  https://mission-control-hq-staging.utahj4754.workers.dev/api/health

curl -H "X-Canary-Group: stable" -w "%{time_total}\n" -o /dev/null -s \
  https://mission-control-hq-staging.utahj4754.workers.dev/api/health
```

### Emergency Procedures

#### Service Down
1. Check heartbeat: `curl https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat`
2. View logs: `wrangler tail --env production`
3. Rollback if needed: `wrangler rollback --env production`
4. Alert team via PagerDuty

#### High Error Rate
1. Check metrics: `curl .../api/ghost/heartbeat | jq '.heartbeat.metrics'`
2. Reduce canary to 0%: `echo "0" | wrangler kv:key put CANARY_PERCENT --env production --binding DEAD_MAN_FUSE`
3. Review recent deploys: `wrangler deployments list --env production`
4. Create checkpoint: `curl -X POST .../api/ghost/rollback`

#### Security Incident
1. Rotate all keys immediately:
   ```bash
   openssl rand -hex 32 | wrangler secret put JWT_SECRET --env production
   openssl rand -hex 32 | wrangler secret put GHOST_SIGNATURE --env production
   openssl rand -hex 32 | wrangler secret put API_KEY_SECRET --env production
   ```
2. Review audit logs for suspicious activity
3. Enable enhanced monitoring
4. Contact security team

### Validation Scripts

```bash
# Full system health check
cat << 'EOF' > health-check.sh
#!/bin/bash
echo "🔍 Mission Control Health Check"
echo "================================"

# Check heartbeat
echo -n "Heartbeat: "
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat | \
  jq -r '.heartbeat.status'

# Check signature
echo -n "Signature Valid: "
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat | \
  jq -r '.verified'

# Check badge status
echo -n "Badge Status: "
curl -s https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/badge.svg | \
  grep -o "Operational\|Degraded\|Outage" | head -1

# Check OpenAPI
echo -n "OpenAPI Available: "
curl -s -o /dev/null -w "%{http_code}" \
  https://mission-control-hq-production.utahj4754.workers.dev/api/openapi.json

echo ""
echo "✅ Health check complete"
EOF

chmod +x health-check.sh
./health-check.sh
```

## 📊 Metrics to Monitor

| Metric | Threshold | Alert Level |
|--------|-----------|-------------|
| P95 Latency | > 500ms | Warning |
| P99 Latency | > 1000ms | Critical |
| Error Rate | > 1% | Warning |
| Error Rate | > 5% | Critical |
| Heartbeat Failure | > 2 min | Critical |
| Signature Invalid | Any | Critical |
| KV Quota | > 80% | Warning |

## 🔄 Deployment Checklist

- [ ] Create rollback checkpoint
- [ ] Deploy to staging
- [ ] Run health check
- [ ] Monitor for 30 minutes
- [ ] Deploy to production
- [ ] Verify heartbeat
- [ ] Check error rates
- [ ] Document in deployment log

## 📞 Escalation Contacts

1. **On-Call Engineer**: Check PagerDuty rotation
2. **Team Lead**: Via Slack #mission-control-critical
3. **Security Team**: security@misson-control.com
4. **Platform Team**: platform@misson-control.com

## 🔍 Advanced Debugging with Cloudflare Trace

### Using Trace Request Tool

Cloudflare's Trace feature helps debug request routing through the CDN:

```bash
# Access via Dashboard
# https://dash.cloudflare.com → Your Domain → Trace

# Test scenarios to trace:

# 1. Rate limit behavior
curl -H "CF-Ray: trace-test" \
  https://mission-control-hq-production.utahj4754.workers.dev/api/health

# 2. Canary routing
curl -H "CF-Connecting-IP: 192.168.1.100" \
  https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat

# 3. Authentication flow
curl -H "Authorization: Bearer invalid-token" \
  https://mission-control-hq-production.utahj4754.workers.dev/api/health

# 4. CORS validation
curl -H "Origin: https://external-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/rollback
```

### Trace Analysis Points

1. **Request Headers**: Verify headers are passed correctly
2. **Rule Application**: Check which rules fire in order
3. **Worker Response**: Validate worker execution
4. **Cache Status**: Confirm cache behavior
5. **Security Features**: WAF, rate limiting, bot management

### Common Trace Patterns

```yaml
Successful Request:
  - Firewall: Pass
  - Rate Limit: Pass  
  - Worker Route: Match
  - Cache: Miss/Hit
  - Response: 200 OK

Rate Limited:
  - Firewall: Pass
  - Rate Limit: Block (429)
  - Worker Route: No execution

Auth Failure:
  - Firewall: Pass
  - Rate Limit: Pass
  - Worker Route: Match
  - Worker Logic: 401 Unauthorized
```

---

*Last Updated: v0.5.0 | Enhanced with Trace Debugging*