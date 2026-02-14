"""API client with authentication and retry logic"""
import requests
from typing import Optional, Dict, Any
from pathlib import Path

from ..auth.token_manager import TokenManager
from ..config.settings import settings
from ..errors.exceptions import (
    AuthenticationError,
    NetworkError,
    RateLimitError,
    XaseError
)
from ..utils.retry import retry_with_backoff
from ..utils.logger import get_logger

logger = get_logger(__name__)


class XaseAPIClient:
    """Xase API client with authentication"""
    
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.api_url
        self.token_manager = TokenManager()
        self.session = requests.Session()
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authentication"""
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'xase-cli/2.0.0'
        }
        
        token = self.token_manager.get_token()
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        return headers
    
    @retry_with_backoff(max_attempts=3, exceptions=(NetworkError,))
    def request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> requests.Response:
        """Make authenticated API request with retry"""
        url = f"{self.base_url}{endpoint}"
        headers = self._get_headers()
        
        if 'headers' in kwargs:
            headers.update(kwargs.pop('headers'))
        
        try:
            response = self.session.request(
                method,
                url,
                headers=headers,
                timeout=settings.api_timeout,
                **kwargs
            )
            
            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 60))
                raise RateLimitError(retry_after)
            
            # Handle authentication errors
            if response.status_code in (401, 403):
                raise AuthenticationError(
                    f"Authentication failed: {response.status_code}",
                    code=str(response.status_code)
                )
            
            response.raise_for_status()
            return response
        
        except requests.Timeout as e:
            raise NetworkError(f"Request timeout: {e}")
        except requests.ConnectionError as e:
            raise NetworkError(f"Connection error: {e}")
        except requests.RequestException as e:
            if not isinstance(e, (RateLimitError, AuthenticationError)):
                raise NetworkError(f"Request failed: {e}")
            raise
    
    def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """GET request"""
        response = self.request('GET', endpoint, **kwargs)
        return response.json()
    
    def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """POST request"""
        response = self.request('POST', endpoint, **kwargs)
        return response.json()
    
    def put(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """PUT request"""
        response = self.request('PUT', endpoint, **kwargs)
        return response.json()
    
    def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """DELETE request"""
        response = self.request('DELETE', endpoint, **kwargs)
        return response.json()
    
    # Convenience methods for common operations
    
    def login(self, email: str) -> Dict[str, Any]:
        """Request OTP for login"""
        return self.post('/api/v1/cli/auth/request-otp', json={'email': email})
    
    def verify_otp(self, email: str, code: str) -> Dict[str, Any]:
        """Verify OTP and get tokens"""
        return self.post('/api/v1/cli/auth/verify-otp', json={'email': email, 'code': code})
    
    def get_usage(self) -> Dict[str, Any]:
        """Get usage statistics"""
        return self.get('/api/v1/usage')
    
    def list_offers(self, limit: int = 20, **filters) -> Dict[str, Any]:
        """List access offers"""
        params = {'limit': limit, **filters}
        return self.get('/api/v1/access-offers', params=params)
    
    def list_leases(self, limit: int = 20) -> Dict[str, Any]:
        """List active leases"""
        return self.get('/api/v1/leases', params={'limit': limit})
    
    def get_lease(self, lease_id: str) -> Dict[str, Any]:
        """Get lease details"""
        return self.get(f'/api/v1/leases/{lease_id}')
    
    def create_lease(self, dataset_id: str, ttl_seconds: int = 1800) -> Dict[str, Any]:
        """Create new lease"""
        return self.post('/api/v1/leases', json={
            'datasetId': dataset_id,
            'ttlSeconds': ttl_seconds
        })
    
    def stream_dataset(
        self,
        dataset_id: str,
        lease_id: str,
        env: str = 'production',
        estimated_hours: float = 0.5
    ) -> Dict[str, Any]:
        """Stream dataset batch"""
        params = {
            'leaseId': lease_id,
            'env': env,
            'estimatedHours': estimated_hours
        }
        return self.get(f'/api/v1/datasets/{dataset_id}/stream', params=params)
