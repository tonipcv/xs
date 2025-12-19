"""
XASE SDK for Python

Official SDK for recording AI decisions as immutable evidence.

Example:
    >>> from xase import XaseClient
    >>> 
    >>> xase = XaseClient({
    ...     "api_key": "xase_pk_...",
    ...     "fire_and_forget": True,
    ... })
    >>> 
    >>> xase.record({
    ...     "policy": "credit_policy_v4",
    ...     "input": {"user_id": "u_001", "amount": 50000},
    ...     "output": {"decision": "APPROVED"},
    ...     "confidence": 0.94,
    ... })
"""

from .client import XaseClient
from .types import (
    RecordPayload,
    RecordResult,
    XaseClientConfig,
    XaseError,
)

__version__ = "0.1.0"

__all__ = [
    "XaseClient",
    "RecordPayload",
    "RecordResult",
    "XaseClientConfig",
    "XaseError",
]
