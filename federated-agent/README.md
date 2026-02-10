# Xase Federated Query Agent

**Secure, outbound-only SQL proxy for federated data access**

## Overview

The Federated Query Agent is a Go-based service that enables secure, governed access to external data sources. It acts as a proxy that:

- ✅ Validates JWT tokens from Xase API
- ✅ Enforces outbound-only connections (no localhost/private IPs)
- ✅ Validates SQL queries (SELECT only, no DDL/DML)
- ✅ Logs all queries to ClickHouse
- ✅ Limits query execution time and result size
- ✅ Supports PostgreSQL, MySQL, Redshift

## Architecture

```
┌─────────────┐      JWT      ┌──────────────────┐
│  Xase API   │ ────────────> │ Federated Agent  │
│  (Node.js)  │               │     (Go)         │
└─────────────┘               └──────────────────┘
                                       │
                                       │ Outbound only
                                       ▼
                              ┌─────────────────┐
                              │ External DB     │
                              │ (Postgres/etc)  │
                              └─────────────────┘
```

## Security Features

### 1. Outbound-Only Enforcement
- Blocks localhost (127.0.0.1)
- Blocks private IPs (10.x, 172.16.x, 192.168.x)
- Allowlist of approved hosts

### 2. Query Validation
- Only SELECT queries allowed
- Blocks: DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, etc.
- Prevents SQL injection

### 3. Resource Limits
- Max query time: 30 seconds
- Max result size: 10,000 rows
- Connection pooling (max 5 connections)

### 4. Authentication
- JWT token validation
- Lease verification via Redis
- Tenant isolation

## Installation

### Prerequisites
- Go 1.21+
- Docker (optional)
- Redis (for lease verification)

### Build from Source

```bash
cd federated-agent

# Install dependencies
go mod download

# Build
go build -o federated-agent .

# Run
./federated-agent
```

### Docker

```bash
# Build image
docker build -t xase/federated-agent:latest .

# Run container
docker run -d \
  -p 8080:8080 \
  -e REDIS_URL=redis://redis:6379 \
  -e CLICKHOUSE_URL=http://clickhouse:8123 \
  --name federated-agent \
  xase/federated-agent:latest
```

## Configuration

Environment variables:

```bash
# Server
PORT=8080
OUTBOUND_ONLY=true

# Redis (for auth)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# ClickHouse (for telemetry)
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=xase
CLICKHOUSE_PASSWORD=xase_dev_password
CLICKHOUSE_DATABASE=xase_audit

# Limits
MAX_QUERY_TIME=30
MAX_RESULT_SIZE=100
```

## API

### POST /query

Execute a federated SQL query.

**Request**:
```json
{
  "dataSourceUrl": "postgresql://user:pass@postgres.xase.internal:5432/db",
  "query": "SELECT id, name, age FROM users WHERE age > $1",
  "parameters": [18],
  "metadata": {
    "tenantId": "tenant_123",
    "userId": "user_456"
  }
}
```

**Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Response**:
```json
{
  "columns": ["id", "name", "age"],
  "rows": [
    [1, "Alice", 25],
    [2, "Bob", 30]
  ],
  "rowCount": 2,
  "metadata": {
    "truncated": false
  }
}
```

### GET /health

Health check endpoint.

**Response**:
```json
{
  "status": "healthy"
}
```

### GET /metrics

Prometheus-style metrics.

**Response**:
```json
{
  "total_queries": 1234,
  "failed_queries": 12,
  "total_rows": 567890,
  "avg_duration_ms": 245
}
```

## Usage Example

### From Xase API

```typescript
import fetch from 'node-fetch'

const response = await fetch('http://federated-agent:8080/query', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    dataSourceUrl: 'postgresql://user:pass@external-db.com:5432/analytics',
    query: 'SELECT COUNT(*) as total FROM events WHERE created_at >= $1',
    parameters: ['2024-01-01'],
  }),
})

const result = await response.json()
console.log(result.rows) // [[12345]]
```

### From Python SDK

```python
import requests

response = requests.post(
    'http://federated-agent:8080/query',
    headers={'Authorization': f'Bearer {jwt_token}'},
    json={
        'dataSourceUrl': 'postgresql://...',
        'query': 'SELECT * FROM users LIMIT 10',
    }
)

data = response.json()
print(data['rows'])
```

## Monitoring

### Logs

```bash
# View logs
docker logs -f federated-agent

# Example output
2024-02-03T19:00:00Z INFO Starting Xase Federated Query Agent version=1.0.0 port=8080
2024-02-03T19:00:01Z INFO Server listening addr=:8080
2024-02-03T19:00:15Z INFO Query executed tenant=tenant_123 rows=42 duration=123ms
2024-02-03T19:00:20Z WARN Invalid data source url=http://localhost:5432 error="private addresses not allowed"
```

### Metrics

Access Prometheus metrics at `/metrics`:

```
# HELP federated_queries_total Total number of queries executed
# TYPE federated_queries_total counter
federated_queries_total 1234

# HELP federated_query_duration_seconds Query execution duration
# TYPE federated_query_duration_seconds histogram
federated_query_duration_seconds_bucket{le="0.1"} 500
federated_query_duration_seconds_bucket{le="0.5"} 1000
federated_query_duration_seconds_bucket{le="1.0"} 1200
```

## Testing

```bash
# Run tests
go test ./...

# Run with coverage
go test -cover ./...

# Benchmark
go test -bench=. ./...
```

## Security Best Practices

1. **Always use TLS** in production
2. **Rotate JWT secrets** regularly
3. **Monitor failed queries** for suspicious activity
4. **Set strict allowlist** of data sources
5. **Use read-only database credentials**
6. **Enable query logging** to ClickHouse
7. **Set resource limits** appropriately

## Troubleshooting

### Query Fails with "host not in allowlist"

Add the host to `AllowedHosts` in `pkg/config/config.go`:

```go
AllowedHosts: []string{
    "postgres.xase.internal",
    "your-db.example.com",
},
```

### Query Fails with "only SELECT queries allowed"

Ensure your query starts with `SELECT` and doesn't contain forbidden keywords.

### Connection Timeout

Increase `MAX_QUERY_TIME` environment variable.

## Roadmap

- [ ] Support for MySQL, Redshift, BigQuery
- [ ] Query result caching
- [ ] Rate limiting per tenant
- [ ] Query cost estimation
- [ ] Automatic query optimization
- [ ] Integration with PEP for column/row filtering

## License

Proprietary - Xase AI

## Support

For issues or questions, contact: eng@xase.ai
