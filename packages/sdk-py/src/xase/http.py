"""
XASE SDK - HTTP Client with Retry Logic
"""

import random
import time
from typing import Any, Dict, Optional

import httpx

from .types import RecordResult, XaseError


class HttpClient:
    """HTTP client with retry logic and exponential backoff."""
    
    def __init__(
        self,
        api_key: str,
        base_url: str,
        timeout: float,
        max_retries: int,
        base_delay: float = 0.1,
        max_delay: float = 5.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
    
    def post(
        self,
        endpoint: str,
        body: Dict[str, Any],
        headers: Optional[Dict[str, str]] = None,
    ) -> RecordResult:
        """Send POST request with retry logic."""
        url = f"{self.base_url}{endpoint}"
        
        request_headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
        }
        if headers:
            request_headers.update(headers)
        
        last_error: Optional[Exception] = None
        
        for attempt in range(self.max_retries + 1):
            try:
                response = httpx.post(
                    url,
                    json=body,
                    headers=request_headers,
                    timeout=self.timeout,
                )
                
                # Success (2xx)
                if response.is_success:
                    return response.json()
                
                # Rate limit (429) - retry with Retry-After
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    delay = (
                        float(retry_after)
                        if retry_after
                        else self._get_backoff_delay(attempt)
                    )
                    
                    if attempt < self.max_retries:
                        time.sleep(delay)
                        continue
                
                # Server errors (5xx) - retry with backoff
                if response.status_code >= 500:
                    if attempt < self.max_retries:
                        time.sleep(self._get_backoff_delay(attempt))
                        continue
                
                # Client errors (4xx) - don't retry, throw immediately
                error_data = response.json() if response.text else {}
                raise XaseError(
                    error_data.get("error", "Request failed"),
                    error_data.get("code", "REQUEST_FAILED"),
                    response.status_code,
                    error_data.get("details"),
                )
            
            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self.max_retries:
                    time.sleep(self._get_backoff_delay(attempt))
                    continue
            
            except httpx.ConnectError as e:
                last_error = e
                if attempt < self.max_retries:
                    time.sleep(self._get_backoff_delay(attempt))
                    continue
            
            except XaseError:
                raise
            
            except Exception as e:
                raise XaseError(
                    str(e),
                    "UNKNOWN_ERROR",
                    None,
                    {"exception": type(e).__name__},
                )
        
        # Max retries exceeded
        if last_error:
            raise XaseError(
                f"Max retries exceeded: {last_error}",
                "MAX_RETRIES",
                None,
                {"last_error": str(last_error)},
            )
        
        raise XaseError("Max retries exceeded", "MAX_RETRIES")
    
    def _get_backoff_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay with jitter."""
        delay = min(self.base_delay * (2 ** attempt), self.max_delay)
        # Jitter: ±25%
        jitter = delay * 0.25 * (random.random() * 2 - 1)
        return max(0, delay + jitter)
