"""
Streaming client with retry logic and circuit breaker pattern
"""

import requests
import time
import json
from typing import Iterator, Dict, Any, Optional, Callable
from enum import Enum
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from .exceptions import XaseError, QueryError
from .auth import LeaseAuthenticator, APIKeyAuthenticator


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """Circuit breaker for resilient API calls"""
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception,
    ):
        """
        Initialize circuit breaker
        
        Args:
            failure_threshold: Number of failures before opening circuit
            recovery_timeout: Seconds to wait before attempting recovery
            expected_exception: Exception type to catch
        """
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = CircuitState.CLOSED
    
    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function with circuit breaker protection
        
        Args:
            func: Function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments
            
        Returns:
            Function result
            
        Raises:
            Exception: If circuit is open or function fails
        """
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitState.HALF_OPEN
            else:
                raise XaseError("Circuit breaker is OPEN. Service unavailable.")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except self.expected_exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        """Handle successful call"""
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED
    
    def _on_failure(self):
        """Handle failed call"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset"""
        if self.last_failure_time is None:
            return False
        return (time.time() - self.last_failure_time) >= self.recovery_timeout


class StreamingClient:
    """Client for streaming data with retry and circuit breaker"""
    
    def __init__(
        self,
        base_url: str,
        authenticator: Optional[LeaseAuthenticator | APIKeyAuthenticator] = None,
        max_retries: int = 3,
        timeout: int = 300,
    ):
        """
        Initialize streaming client
        
        Args:
            base_url: Base URL of the Xase API
            authenticator: Authentication handler
            max_retries: Maximum number of retry attempts
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.authenticator = authenticator
        self.max_retries = max_retries
        self.timeout = timeout
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            recovery_timeout=60,
            expected_exception=requests.exceptions.RequestException,
        )
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
        )),
    )
    def _make_request(self, url: str, headers: Dict[str, str]) -> requests.Response:
        """
        Make HTTP request with retry logic
        
        Args:
            url: Request URL
            headers: Request headers
            
        Returns:
            Response object
        """
        return requests.get(url, headers=headers, timeout=self.timeout, stream=True)
    
    def stream_dataset(
        self,
        dataset_id: str,
        lease_id: Optional[str] = None,
        chunk_size: int = 8192,
    ) -> Iterator[Dict[str, Any]]:
        """
        Stream dataset with automatic retry and circuit breaker
        
        Args:
            dataset_id: Dataset ID to stream
            lease_id: Optional lease ID (overrides authenticator)
            chunk_size: Size of chunks to read
            
        Yields:
            Parsed JSON objects from stream
            
        Raises:
            XaseError: If streaming fails
            QueryError: If query is rejected
        """
        url = f"{self.base_url}/api/v1/datasets/{dataset_id}/stream"
        
        # Build headers
        headers = {}
        if self.authenticator:
            headers.update(self.authenticator.get_headers())
        
        # Add lease ID if provided
        if lease_id:
            url += f"?leaseId={lease_id}"
        
        try:
            # Use circuit breaker for resilience
            response = self.circuit_breaker.call(
                self._make_request,
                url,
                headers,
            )
            
            if response.status_code == 429:
                raise QueryError("Epsilon budget exhausted (429). Please reset budget or wait.")
            
            if response.status_code == 403:
                raise QueryError("Access forbidden. Check policy and lease validity.")
            
            if not response.ok:
                raise XaseError(f"Stream request failed: {response.status_code} {response.text}")
            
            # Stream and parse NDJSON
            buffer = ""
            for chunk in response.iter_content(chunk_size=chunk_size, decode_unicode=True):
                if not chunk:
                    continue
                
                buffer += chunk
                lines = buffer.split('\n')
                buffer = lines[-1]  # Keep incomplete line in buffer
                
                for line in lines[:-1]:
                    line = line.strip()
                    if not line:
                        continue
                    
                    try:
                        obj = json.loads(line)
                        yield obj
                    except json.JSONDecodeError:
                        # Skip malformed lines
                        continue
            
            # Process remaining buffer
            if buffer.strip():
                try:
                    obj = json.loads(buffer)
                    yield obj
                except json.JSONDecodeError:
                    pass
        
        except requests.exceptions.RequestException as e:
            raise XaseError(f"Streaming failed: {str(e)}")
    
    def stream_with_epsilon_tracking(
        self,
        dataset_id: str,
        lease_id: str,
        on_epsilon_consumed: Optional[Callable[[float], None]] = None,
    ) -> Iterator[Dict[str, Any]]:
        """
        Stream dataset with epsilon consumption tracking
        
        Args:
            dataset_id: Dataset ID to stream
            lease_id: Lease ID for access
            on_epsilon_consumed: Callback when epsilon is consumed
            
        Yields:
            Parsed JSON objects from stream
        """
        total_epsilon = 0.0
        
        for obj in self.stream_dataset(dataset_id, lease_id):
            # Track epsilon if present in response
            if 'epsilonConsumed' in obj:
                epsilon = obj['epsilonConsumed']
                total_epsilon = epsilon
                
                if on_epsilon_consumed:
                    on_epsilon_consumed(epsilon)
            
            yield obj
        
        # Final epsilon report
        if on_epsilon_consumed and total_epsilon > 0:
            on_epsilon_consumed(total_epsilon)
