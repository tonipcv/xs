"""
XASE SDK - Fire-and-Forget Queue

In-memory queue with background worker for zero-latency evidence recording.
"""

import queue
import threading
import time
from typing import Any, Callable, Dict, Optional

from .http import HttpClient
from .types import RecordPayload, RecordResult, XaseError


class Queue:
    """Fire-and-forget queue with background worker."""
    
    def __init__(
        self,
        http_client: HttpClient,
        max_size: int,
        on_error: Optional[Callable[[XaseError], None]] = None,
        on_success: Optional[Callable[[RecordResult], None]] = None,
    ) -> None:
        self.http_client = http_client
        self.max_size = max_size
        self.on_error = on_error
        self.on_success = on_success
        
        self._queue: queue.Queue[Dict[str, Any]] = queue.Queue(maxsize=max_size)
        self._closed = False
        self._worker_thread: Optional[threading.Thread] = None
        
        self._start_worker()
    
    def enqueue(
        self,
        payload: RecordPayload,
        idempotency_key: Optional[str] = None,
    ) -> None:
        """Enqueue a record for async processing."""
        if self._closed:
            raise XaseError("Queue is closed", "QUEUE_CLOSED")
        
        item = {
            "payload": payload,
            "idempotency_key": idempotency_key,
        }
        
        try:
            self._queue.put_nowait(item)
        except queue.Full:
            # Drop oldest item
            try:
                dropped = self._queue.get_nowait()
                if self.on_error:
                    self.on_error(
                        XaseError("Queue full, item dropped", "QUEUE_FULL")
                    )
            except queue.Empty:
                pass
            
            # Try again
            try:
                self._queue.put_nowait(item)
            except queue.Full:
                raise XaseError("Queue full", "QUEUE_FULL")
    
    def _start_worker(self) -> None:
        """Start background worker thread."""
        self._worker_thread = threading.Thread(
            target=self._process_queue,
            daemon=True,
        )
        self._worker_thread.start()
    
    def _process_queue(self) -> None:
        """Process queue items in background."""
        while not self._closed:
            try:
                item = self._queue.get(timeout=0.1)
                
                try:
                    result = self._send_record(
                        item["payload"],
                        item.get("idempotency_key"),
                    )
                    if self.on_success:
                        self.on_success(result)
                
                except Exception as e:
                    if self.on_error:
                        xase_error = (
                            e if isinstance(e, XaseError)
                            else XaseError(str(e), "QUEUE_ERROR", None, {"exception": type(e).__name__})
                        )
                        self.on_error(xase_error)
                
                finally:
                    self._queue.task_done()
            
            except queue.Empty:
                continue
    
    def _send_record(
        self,
        payload: RecordPayload,
        idempotency_key: Optional[str] = None,
    ) -> RecordResult:
        """Send record to API."""
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
    
    def flush(self, timeout_s: float = 5.0) -> None:
        """Flush all pending items."""
        start = time.time()
        
        while not self._queue.empty():
            if time.time() - start > timeout_s:
                remaining = self._queue.qsize()
                raise XaseError(
                    f"Flush timeout: {remaining} items remaining",
                    "FLUSH_TIMEOUT",
                )
            time.sleep(0.05)
        
        # Wait for worker to finish processing
        self._queue.join()
    
    def close(self) -> None:
        """Close queue and stop worker."""
        self._closed = True
        if self._worker_thread:
            self._worker_thread.join(timeout=2.0)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        return {
            "size": self._queue.qsize(),
            "closed": self._closed,
        }
