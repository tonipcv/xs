"""
Authentication module for Xase SDK
Handles lease-based authentication and JWT token management
"""

import jwt
import time
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from .exceptions import AuthenticationError


class LeaseAuthenticator:
    """Manages authentication using lease IDs and JWT tokens"""
    
    def __init__(self, base_url: str, lease_id: str, jwt_secret: Optional[str] = None):
        """
        Initialize authenticator with lease credentials
        
        Args:
            base_url: Base URL of the Xase API
            lease_id: Valid lease ID for data access
            jwt_secret: Optional JWT secret for token generation (server-side only)
        """
        self.base_url = base_url.rstrip('/')
        self.lease_id = lease_id
        self.jwt_secret = jwt_secret
        self._token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
    
    def get_token(self) -> str:
        """
        Get a valid JWT token, refreshing if necessary
        
        Returns:
            Valid JWT token string
            
        Raises:
            AuthenticationError: If token generation fails
        """
        if self._token and self._token_expiry:
            # Check if token is still valid (with 5 min buffer)
            if datetime.utcnow() < self._token_expiry - timedelta(minutes=5):
                return self._token
        
        # Generate new token
        self._token = self._generate_token()
        return self._token
    
    def _generate_token(self) -> str:
        """
        Generate a new JWT token
        
        Returns:
            JWT token string
            
        Raises:
            AuthenticationError: If token generation fails
        """
        if not self.jwt_secret:
            raise AuthenticationError(
                "JWT secret not provided. For client-side usage, obtain token from server."
            )
        
        try:
            now = datetime.utcnow()
            expiry = now + timedelta(hours=1)
            
            payload = {
                'leaseId': self.lease_id,
                'iat': int(now.timestamp()),
                'exp': int(expiry.timestamp()),
            }
            
            token = jwt.encode(payload, self.jwt_secret, algorithm='HS256')
            self._token_expiry = expiry
            
            return token
        except Exception as e:
            raise AuthenticationError(f"Failed to generate JWT token: {str(e)}")
    
    def get_headers(self) -> Dict[str, str]:
        """
        Get authentication headers for API requests
        
        Returns:
            Dictionary of HTTP headers
        """
        token = self.get_token()
        return {
            'Authorization': f'Bearer {token}',
            'X-Lease-ID': self.lease_id,
        }
    
    def validate_lease(self) -> bool:
        """
        Validate that the lease is still active
        
        Returns:
            True if lease is valid, False otherwise
        """
        # This would typically make an API call to verify lease status
        # For now, we assume the lease is valid if we have a lease_id
        return bool(self.lease_id)


class APIKeyAuthenticator:
    """Manages authentication using API keys"""
    
    def __init__(self, api_key: str):
        """
        Initialize authenticator with API key
        
        Args:
            api_key: Valid Xase API key (format: xase_...)
        """
        if not api_key.startswith('xase_'):
            raise AuthenticationError("Invalid API key format. Must start with 'xase_'")
        
        self.api_key = api_key
    
    def get_headers(self) -> Dict[str, str]:
        """
        Get authentication headers for API requests
        
        Returns:
            Dictionary of HTTP headers
        """
        return {
            'X-API-Key': self.api_key,
        }
