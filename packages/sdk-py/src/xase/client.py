"""
XASE SDK - Main Client

Official SDK for recording AI decisions as immutable evidence.
"""

import atexit
import os
import signal
from typing import Any, Dict, Optional

from .context import capture_context, generate_idempotency_key, is_valid_idempotency_key
from .http import HttpClient
from .queue import Queue
from .types import RecordPayload, RecordResult, XaseClientConfig, XaseError


class XaseClient:
    """Main client for recording AI decisions as immutable evidence."""
    
    def __init__(self, config: XaseClientConfig) -> None:
        """Initialize XaseClient with configuration."""
        # Validate API key
        api_key = config.get("api_key")
        if not api_key:
            raise XaseError("API key is required", "MISSING_API_KEY")
        
        # Merge with defaults
        self.config: Dict[str, Any] = {
            "api_key": api_key,
            "base_url": config.get("base_url") or os.getenv("XASE_BASE_URL") or "http://localhost:3000/api/xase/v1",
            "timeout": config.get("timeout", 3.0),
            "fire_and_forget": config.get("fire_and_forget", True),
            "max_retries": config.get("max_retries", 3),
            "queue_max_size": config.get("queue_max_size", 10000),
            "on_error": config.get("on_error"),
            "on_success": config.get("on_success"),
        }
        
        # Initialize HTTP client
        self.http_client = HttpClient(
            api_key=self.config["api_key"],
            base_url=self.config["base_url"],
            timeout=self.config["timeout"],
            max_retries=self.config["max_retries"],
        )
        
        # Initialize queue if fire-and-forget enabled
        self.queue: Optional[Queue] = None
        if self.config["fire_and_forget"]:
            self.queue = Queue(
                http_client=self.http_client,
                max_size=self.config["queue_max_size"],
                on_error=self.config["on_error"],
                on_success=self.config["on_success"],
            )
            
            # Register exit handlers
            atexit.register(self._cleanup)
            signal.signal(signal.SIGINT, self._signal_handler)
            signal.signal(signal.SIGTERM, self._signal_handler)
    
    def record(
        self,
        payload: RecordPayload,
        *,
        idempotency_key: Optional[str] = None,
        skip_queue: bool = False,
    ) -> Optional[RecordResult]:
        """
        Record an AI decision as immutable evidence.
        
        Args:
            payload: Decision data (policy, input, output, etc.)
            idempotency_key: Custom idempotency key (UUID or alphanumeric 16-64 chars)
            skip_queue: Force synchronous mode even with fire_and_forget enabled
        
        Returns:
            RecordResult if sync mode, None if fire-and-forget
        """
        # Validate payload
        self._validate_payload(payload)
        
        # Enrich with runtime context
        enriched_payload: RecordPayload = {
            **payload,
            "context": {
                **capture_context(),
                **(payload.get("context") or {}),
            },
        }
        
        # Generate idempotency key if needed
        final_idempotency_key = idempotency_key
        if not final_idempotency_key and payload.get("transaction_id"):
            final_idempotency_key = generate_idempotency_key(payload["transaction_id"])
        
        # Validate idempotency key format if provided
        if final_idempotency_key and not is_valid_idempotency_key(final_idempotency_key):
            raise XaseError(
                "Invalid idempotency key format. Use UUID v4 or alphanumeric 16-64 chars",
                "INVALID_IDEMPOTENCY_KEY",
            )
        
        # Fire-and-forget mode
        if self.config["fire_and_forget"] and not skip_queue and self.queue:
            self.queue.enqueue(enriched_payload, final_idempotency_key)
            return None
        
        # Synchronous mode
        return self._send_record(enriched_payload, final_idempotency_key)
    
    def _send_record(
        self,
        payload: RecordPayload,
        idempotency_key: Optional[str] = None,
    ) -> RecordResult:
        """Send record synchronously."""
        headers: Dict[str, str] = {}
        
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        
        # Map SDK payload to API schema
        body = {
            "input": payload["input"],
            "output": payload["output"],
            "context": payload.get("context"),
            "policyId": payload["policy"],
            "policyVersion": payload.get("policy_version"),
            "decisionType": payload.get("decision_type"),
            "confidence": payload.get("confidence"),
            "processingTime": payload.get("processing_time"),
            "storePayload": payload.get("store_payload"),
        }
        
        return self.http_client.post("/records", body, headers)
    
    def _validate_payload(self, payload: RecordPayload) -> None:
        """Validate record payload."""
        if not payload.get("policy"):
            raise XaseError("Policy is required", "MISSING_POLICY")
        
        if not payload.get("input") or not isinstance(payload.get("input"), dict):
            raise XaseError("Input must be a dict", "INVALID_INPUT")
        
        if not payload.get("output") or not isinstance(payload.get("output"), dict):
            raise XaseError("Output must be a dict", "INVALID_OUTPUT")
        
        confidence = payload.get("confidence")
        if confidence is not None:
            if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
                raise XaseError(
                    "Confidence must be a number between 0 and 1",
                    "INVALID_CONFIDENCE",
                )
    
    def flush(self, timeout_s: float = 5.0) -> None:
        """
        Flush pending queue items.
        
        Args:
            timeout_s: Maximum time to wait (default: 5.0 seconds)
        """
        if self.queue:
            self.queue.flush(timeout_s)
    
    def close(self) -> None:
        """Close client and flush queue."""
        try:
            self.flush(2.0)
        finally:
            if self.queue:
                self.queue.close()
    
    def get_stats(self) -> Optional[Dict[str, Any]]:
        """Get queue statistics (if fire-and-forget enabled)."""
        if self.queue:
            return self.queue.get_stats()
        return None
    
    def _cleanup(self) -> None:
        """Cleanup on exit."""
        try:
            self.flush(2.0)
        except Exception:
            pass
    
    def _signal_handler(self, signum: int, frame: Any) -> None:
        """Handle signals."""
        self.close()
        exit(0)
