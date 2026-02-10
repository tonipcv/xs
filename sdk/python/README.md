# Xase Python SDK

Official Python SDK for Xase - The Trust Layer for AI Data Access.

## Features

- 🔐 **Lease-based Authentication** - Secure access with JWT tokens
- 📡 **Streaming with Retry** - Resilient data streaming with automatic retry
- 🔄 **Circuit Breaker** - Fault tolerance for external services
- 🎭 **Differential Privacy** - Built-in DP client for privacy-preserving queries
- 🛡️ **K-Anonymity Validation** - Ensure data anonymity constraints
- ✂️ **Rewrite Rules** - Apply column filtering and masking
- 📊 **Epsilon Budget Tracking** - Monitor privacy budget consumption

## Installation

```bash
pip install xase
```

## Quick Start

### Basic Client Usage

```python
from xase import XaseClient

# Initialize client
client = XaseClient(api_key="your-api-key")

# Execute federated query
results = client.query(
    data_source="postgres.xase.internal",
    query="SELECT * FROM users WHERE age > 18"
)

# List datasets
datasets = client.list_datasets(tenant_id="tenant-123")

# Create access lease
lease = client.create_lease(
    dataset_id="dataset-456",
    purpose="TRAINING",
    duration=3600
)
```

### Streaming with Lease Authentication

```python
from xase import LeaseAuthenticator, StreamingClient

# Authenticate with lease
auth = LeaseAuthenticator(
    base_url="https://api.xase.ai",
    lease_id="your-lease-id"
)

# Create streaming client
client = StreamingClient(
    base_url="https://api.xase.ai",
    authenticator=auth
)

# Stream dataset with epsilon tracking
def on_epsilon(epsilon):
    print(f"Epsilon consumed: {epsilon:.4f}")

for record in client.stream_with_epsilon_tracking(
    dataset_id="dataset-123",
    lease_id="your-lease-id",
    on_epsilon_consumed=on_epsilon
):
    print(record)
```

### Differential Privacy

```python
from xase import DPClient, DPMechanism

# Initialize DP client
dp = DPClient(epsilon=1.0)

# Differentially private count
noisy_count = dp.count_query(data)

# Differentially private mean
noisy_mean = dp.mean_query(
    data,
    column="salary",
    max_value=100000,
    mechanism=DPMechanism.LAPLACE
)

# Check remaining budget
remaining = dp.get_remaining_budget()
print(f"Remaining epsilon: {remaining:.4f}")
```

### Rewrite Rules & Column Filtering

```python
from xase import RewriteRulesHelper

# Configure rewrite rules
helper = RewriteRulesHelper(
    allowed_columns=["age", "salary"],
    denied_columns=["ssn", "name"],
    masking_rules={
        "email": "partial",  # Partially mask
        "phone": "redact"    # Fully redact
    }
)

# Process data
processed = helper.process_row(record)
```

### K-Anonymity Validation

```python
from xase import KAnonymityValidator

# Initialize validator
validator = KAnonymityValidator(k_min=5)

# Check k-anonymity
result = validator.check_k_anonymity(
    data,
    quasi_identifiers=["zip", "age", "gender"]
)

if not result['valid']:
    print(f"K-anonymity violated: k={result['k_value']}")
    print(f"Violations: {result['violations']}")
```

### Circuit Breaker for Resilience

```python
from xase.streaming import CircuitBreaker

# Initialize circuit breaker
breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60
)

# Use circuit breaker
try:
    result = breaker.call(api_function, *args)
except Exception as e:
    print(f"Circuit open: {e}")
```

## Advanced Usage

### Complete AI Lab Workflow

```python
from xase import (
    LeaseAuthenticator,
    StreamingClient,
    DPClient,
    RewriteRulesHelper,
    KAnonymityValidator
)

# 1. Authenticate
auth = LeaseAuthenticator(
    base_url="https://api.xase.ai",
    lease_id="your-lease-id"
)

# 2. Setup streaming
streaming = StreamingClient(
    base_url="https://api.xase.ai",
    authenticator=auth
)

# 3. Configure privacy
dp = DPClient(epsilon=1.0)
rewriter = RewriteRulesHelper(
    allowed_columns=["age", "income"],
    denied_columns=["ssn"]
)

# 4. Stream and process
records = []
for record in streaming.stream_dataset("dataset-123"):
    processed = rewriter.process_row(record)
    if processed:
        records.append(processed)

# 5. Compute private statistics
noisy_count = dp.count_query(records)
noisy_mean = dp.mean_query(records, "income", max_value=200000)

print(f"Count: {noisy_count:.0f}")
print(f"Mean income: ${noisy_mean:.2f}")
print(f"Epsilon used: {dp.consumed_epsilon:.4f}")
```

## API Reference

### Authentication

- `LeaseAuthenticator(base_url, lease_id, jwt_secret=None)` - Lease-based auth
- `APIKeyAuthenticator(api_key)` - API key auth

### Streaming

- `StreamingClient(base_url, authenticator, max_retries=3, timeout=300)`
  - `stream_dataset(dataset_id, lease_id, chunk_size=8192)` - Stream data
  - `stream_with_epsilon_tracking(dataset_id, lease_id, on_epsilon_consumed)` - Stream with DP tracking

### Differential Privacy

- `DPClient(epsilon=1.0, delta=1e-5)`
  - `count_query(data, condition, mechanism)` - Private count
  - `sum_query(data, column, max_value, mechanism)` - Private sum
  - `mean_query(data, column, max_value, mechanism)` - Private mean
  - `histogram_query(data, column, bins, mechanism)` - Private histogram
  - `get_remaining_budget()` - Check remaining epsilon
  - `reset_budget()` - Reset consumed epsilon

### Helpers

- `RewriteRulesHelper(allowed_columns, denied_columns, row_filters, masking_rules)`
  - `process_row(data)` - Apply all rules to a row
  - `filter_columns(data)` - Filter columns
  - `apply_masking(data)` - Apply masking

- `KAnonymityValidator(k_min=5)`
  - `check_k_anonymity(data, quasi_identifiers)` - Validate k-anonymity
  - `suggest_suppression(data, quasi_identifiers)` - Suggest records to suppress

### Circuit Breaker

- `CircuitBreaker(failure_threshold=5, recovery_timeout=60)`
  - `call(func, *args, **kwargs)` - Execute with circuit breaker protection

## Examples

See the `examples/` directory for complete working examples:

- `basic_usage.py` - Basic SDK usage
- `streaming_example.py` - Streaming with retry and circuit breaker
- `dp_example.py` - Differential privacy queries
- `k_anonymity_example.py` - K-anonymity validation

## Error Handling

```python
from xase import XaseError, QueryError, AuthenticationError

try:
    results = client.query(...)
except AuthenticationError as e:
    print(f"Auth failed: {e}")
except QueryError as e:
    print(f"Query failed: {e}")
except XaseError as e:
    print(f"SDK error: {e}")
```

## Query audit logs
audit_logs = client.query_audit_logs(
    tenant_id="tenant-123",
    event_type="data_access",
    start_date="2026-01-01T00:00:00Z",
    end_date="2026-02-01T00:00:00Z"
)
```

## Context Manager

```python
with XaseClient(api_key="your-api-key") as client:
    results = client.query(
        data_source="postgres.xase.internal",
        query="SELECT COUNT(*) FROM users"
    )
    print(results)
```

## Error Handling

```python
from xase import XaseClient
from xase.exceptions import (
    AuthenticationError,
    PolicyViolationError,
    QueryError
)

client = XaseClient(api_key="your-api-key")

try:
    results = client.query(
        data_source="postgres.xase.internal",
        query="SELECT * FROM sensitive_data"
    )
except AuthenticationError:
    print("Invalid API key")
except PolicyViolationError as e:
    print(f"Policy violation: {e.message}")
    print(f"Details: {e.details}")
except QueryError as e:
    print(f"Query failed: {e.message}")
```

## Configuration

```python
client = XaseClient(
    api_key="your-api-key",
    base_url="https://api.xase.ai",  # Optional: custom API URL
    timeout=30  # Optional: request timeout in seconds
)
```

## Features

- **Federated Queries**: Execute SQL queries across multiple data sources
- **Policy Enforcement**: Automatic policy-based access control
- **Privacy Tools**: K-anonymity, differential privacy, PII detection
- **Audit Logs**: Query comprehensive audit trail
- **Lease Management**: Create and manage data access leases
- **Type Safety**: Full type hints for better IDE support

## API Reference

### XaseClient

#### `query(data_source, query, params=None)`
Execute a federated query.

**Parameters:**
- `data_source` (str): Data source identifier
- `query` (str): SQL query to execute
- `params` (dict, optional): Query parameters

**Returns:** List[Dict[str, Any]]

#### `list_datasets(tenant_id=None, limit=50, offset=0)`
List available datasets.

**Parameters:**
- `tenant_id` (str, optional): Filter by tenant ID
- `limit` (int): Maximum number of results
- `offset` (int): Offset for pagination

**Returns:** Dict[str, Any]

#### `create_lease(dataset_id, purpose, duration=None)`
Create an access lease.

**Parameters:**
- `dataset_id` (str): Dataset ID
- `purpose` (str): Purpose (TRAINING, INFERENCE, ANALYTICS)
- `duration` (int, optional): Lease duration in seconds

**Returns:** Dict[str, Any]

#### `validate_policy(policy_yaml)`
Validate a policy YAML.

**Parameters:**
- `policy_yaml` (str): Policy in YAML format

**Returns:** Dict[str, Any]

#### `analyze_privacy(dataset_id, quasi_identifiers=None, k=5)`
Analyze dataset privacy.

**Parameters:**
- `dataset_id` (str): Dataset ID
- `quasi_identifiers` (List[str], optional): Quasi-identifier columns
- `k` (int): K-anonymity threshold

**Returns:** Dict[str, Any]

#### `detect_pii(data)`
Detect PII in data.

**Parameters:**
- `data` (List[Dict]): Data records

**Returns:** Dict[str, Any]

#### `query_audit_logs(tenant_id, event_type=None, start_date=None, end_date=None, limit=100, offset=0)`
Query audit logs.

**Parameters:**
- `tenant_id` (str): Tenant ID
- `event_type` (str, optional): Event type filter
- `start_date` (str, optional): Start date (ISO format)
- `end_date` (str, optional): End date (ISO format)
- `limit` (int): Maximum number of results
- `offset` (int): Offset for pagination

**Returns:** Dict[str, Any]

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run linter
flake8 xase

# Format code
black xase

# Type checking
mypy xase
```

## License

MIT License - see LICENSE file for details.

## Support

- Documentation: https://docs.xase.ai
- Issues: https://github.com/xase/xase-python-sdk/issues
- Email: support@xase.ai
