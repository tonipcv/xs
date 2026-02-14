# RUNBOOK-001: High Error Rate

**Alert:** `HighErrorRate`  
**Severity:** Critical  
**Component:** Brain (Control Plane)  
**SLA Impact:** Yes (Error rate >0.1%)

---

## Symptoms

- Prometheus alert: Error rate above 0.1%
- Users reporting 500 errors
- Increased latency
- Failed API requests

---

## Diagnosis

### 1. Check Error Rate Dashboard

```bash
# Open Grafana
open https://grafana.xase.ai/d/errors

# Check error rate by endpoint
curl -s "http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~\"5..\"}[5m])" | jq
```

### 2. Check Recent Deployments

```bash
# List recent deployments
kubectl rollout history deployment/brain -n production

# Check if error rate correlates with deployment
kubectl rollout status deployment/brain -n production
```

### 3. Check Database Health

```bash
# Check database connections
kubectl exec -it postgres-0 -n production -- psql -U xase -c "SELECT count(*) FROM pg_stat_activity;"

# Check for long-running queries
kubectl exec -it postgres-0 -n production -- psql -U xase -c "SELECT pid, now() - query_start as duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;"
```

### 4. Check Logs

```bash
# Tail Brain logs
kubectl logs -f deployment/brain -n production --tail=100 | grep ERROR

# Check for specific error patterns
kubectl logs deployment/brain -n production --since=10m | grep -E "(ECONNREFUSED|ETIMEDOUT|Database|Redis)"
```

---

## Resolution

### Scenario 1: Database Connection Pool Exhausted

**Symptoms:** Errors like `ECONNREFUSED` or `connection pool exhausted`

**Fix:**
```bash
# Scale up database connection pool
kubectl edit configmap brain-config -n production
# Increase POSTGRES_MAX_CONNECTIONS from 100 to 200

# Restart Brain pods
kubectl rollout restart deployment/brain -n production
```

### Scenario 2: Bad Deployment

**Symptoms:** Error rate spiked after recent deployment

**Fix:**
```bash
# Rollback to previous version
kubectl rollout undo deployment/brain -n production

# Verify rollback
kubectl rollout status deployment/brain -n production

# Check error rate after 5 minutes
```

### Scenario 3: External Service Down (S3, Redis)

**Symptoms:** Errors mentioning S3 or Redis

**Fix:**
```bash
# Check Redis health
kubectl exec -it redis-0 -n production -- redis-cli ping

# Check S3 connectivity
kubectl exec -it deployment/brain -n production -- curl -I https://s3.amazonaws.com

# If Redis is down, restart
kubectl rollout restart statefulset/redis -n production
```

### Scenario 4: Memory Leak / OOM

**Symptoms:** Pods restarting frequently, memory usage climbing

**Fix:**
```bash
# Check memory usage
kubectl top pods -n production

# Increase memory limits
kubectl edit deployment brain -n production
# Change memory limit from 2Gi to 4Gi

# Apply changes
kubectl rollout restart deployment/brain -n production
```

---

## Escalation

If error rate doesn't drop below 0.1% after 15 minutes:

1. **Page on-call engineer:**
   ```bash
   curl -X POST https://api.pagerduty.com/incidents \
     -H "Authorization: Token $PAGERDUTY_TOKEN" \
     -d '{"incident": {"type": "incident", "title": "High Error Rate - Manual Intervention Required"}}'
   ```

2. **Enable maintenance mode:**
   ```bash
   kubectl scale deployment/brain -n production --replicas=0
   # Display maintenance page to users
   ```

3. **Notify customers:**
   - Post to status page: https://status.xase.ai
   - Send email to active contracts

---

## Post-Incident

1. **Write post-mortem:**
   - Root cause
   - Timeline
   - Action items

2. **Update runbook:**
   - Add new scenario if discovered
   - Improve diagnosis steps

3. **Implement prevention:**
   - Add monitoring for root cause
   - Improve error handling
   - Add circuit breakers

---

## Related Runbooks

- [RUNBOOK-002: High Latency](./RUNBOOK-002-HIGH-LATENCY.md)
- [RUNBOOK-003: Database Deadlock](./RUNBOOK-003-DATABASE-DEADLOCK.md)

---

**Last Updated:** 2026-02-12  
**Owner:** Platform Team
