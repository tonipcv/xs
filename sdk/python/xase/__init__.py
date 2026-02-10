"""
Xase Python SDK - Trust Layer for AI Data Access

Provides secure, policy-enforced access to federated data sources.
"""

__version__ = "1.0.0"

from .client import XaseClient
from .exceptions import (
    XaseError,
    AuthenticationError,
    PolicyViolationError,
    QueryError,
)
from .auth import LeaseAuthenticator, APIKeyAuthenticator
from .streaming import StreamingClient, CircuitBreaker
from .helpers import RewriteRulesHelper, KAnonymityValidator, validate_query_columns
from .dp_client import DPClient, DPBudgetTracker, DPMechanism

__all__ = [
    "XaseClient",
    "XaseError",
    "AuthenticationError",
    "PolicyViolationError",
    "QueryError",
    "LeaseAuthenticator",
    "APIKeyAuthenticator",
    "StreamingClient",
    "CircuitBreaker",
    "RewriteRulesHelper",
    "KAnonymityValidator",
    "validate_query_columns",
    "DPClient",
    "DPBudgetTracker",
    "DPMechanism",
]
