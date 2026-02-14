"""Token management with auto-refresh"""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

from ..errors.exceptions import AuthenticationError


class TokenManager:
    """Manages Bearer tokens with auto-refresh"""
    
    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or Path.home() / ".xase" / "config.json"
        self.lock = threading.Lock()
        self._config = None
    
    @property
    def config(self) -> dict:
        """Load config lazily"""
        if self._config is None:
            self._config = self.load_config()
        return self._config
    
    def load_config(self) -> dict:
        """Load tokens from disk"""
        if not self.config_path.exists():
            return {}
        
        try:
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    
    def save_config(self, config: dict):
        """Save tokens to disk with secure permissions"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        # Secure permissions (owner read/write only)
        self.config_path.chmod(0o600)
        
        self._config = config
    
    def get_token(self) -> Optional[str]:
        """Get current access token, auto-refreshing if needed"""
        with self.lock:
            if not self.config.get('access_token'):
                return None
            
            # Check if token needs refresh
            if self.expires_in() < 120:  # 2 minutes threshold
                try:
                    self.refresh_token()
                except Exception:
                    # Refresh failed, token might still be valid
                    pass
            
            return self.config.get('access_token')
    
    def expires_in(self) -> int:
        """Seconds until token expiration"""
        if not self.config.get('issued_at'):
            return 0
        
        try:
            issued = datetime.fromisoformat(self.config['issued_at'].replace('Z', '+00:00'))
            elapsed = (datetime.now(timezone.utc) - issued).total_seconds()
            ttl = self.config.get('expires_in', 900)  # Default 15min
            return max(0, int(ttl - elapsed))
        except (ValueError, KeyError):
            return 0
    
    def requires_refresh(self) -> bool:
        """Check if token should be refreshed"""
        return self.expires_in() < 120
    
    def refresh_token(self) -> bool:
        """Attempt to refresh token"""
        refresh_token = self.config.get('refresh_token')
        if not refresh_token:
            raise AuthenticationError("No refresh token available")
        
        api_url = self.config.get('api_url', 'http://localhost:3000')
        
        try:
            response = requests.post(
                f"{api_url}/api/v1/cli/auth/refresh",
                json={'refresh_token': refresh_token},
                timeout=10
            )
            
            if response.ok:
                data = response.json()
                self.save_tokens(data)
                return True
            else:
                raise AuthenticationError(f"Refresh failed: {response.status_code}")
        
        except requests.RequestException as e:
            raise AuthenticationError(f"Network error during refresh: {e}")
    
    def save_tokens(self, token_data: dict):
        """Save new tokens"""
        config = self.config.copy()
        config.update({
            'access_token': token_data.get('access_token'),
            'refresh_token': token_data.get('refresh_token'),
            'expires_in': token_data.get('expires_in', 900),
            'issued_at': datetime.now(timezone.utc).isoformat(),
        })
        self.save_config(config)
    
    def clear_tokens(self):
        """Remove all tokens"""
        if self.config_path.exists():
            self.config_path.unlink()
        self._config = {}
