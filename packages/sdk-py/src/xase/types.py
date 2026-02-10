"""
XASE SDK - Type Definitions
"""

from typing import Any, Callable, Dict, Literal, Optional, TypedDict


class RecordPayload(TypedDict, total=False):
    """Payload for recording an AI decision."""
    
    policy: str  # Required
    input: Dict[str, Any]  # Required
    output: Dict[str, Any]  # Required
    confidence: Optional[float]
    context: Optional[Dict[str, Any]]
    transaction_id: Optional[str]
    policy_version: Optional[str]
    decision_type: Optional[str]
    processing_time: Optional[float]
    store_payload: Optional[bool]


class RecordResult(TypedDict):
    """Result from recording an AI decision."""
    
    success: bool
    transaction_id: str
    receipt_url: str
    timestamp: str
    record_hash: str
    chain_position: Literal["chained", "genesis"]


class XaseClientConfig(TypedDict, total=False):
    """Configuration for XaseClient."""
    
    api_key: str  # Required
    base_url: Optional[str]
    timeout: Optional[float]
    fire_and_forget: Optional[bool]
    max_retries: Optional[int]
    queue_max_size: Optional[int]
    on_error: Optional[Callable[["XaseError"], None]]
    on_success: Optional[Callable[[RecordResult], None]]


class XaseError(Exception):
    """Custom exception for Xase SDK errors."""
    
    def __init__(
        self,
        message: str,
        code: str,
        status_code: Optional[int] = None,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
    
    def __str__(self) -> str:
        return f"XaseError({self.code}): {self.message}"
    
    def __repr__(self) -> str:
        return (
            f"XaseError(message={self.message!r}, code={self.code!r}, "
            f"status_code={self.status_code!r}, details={self.details!r})"
        )
