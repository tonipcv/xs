"""
Exception classes for XASE Sheets SDK
"""

from typing import Optional, Dict, Any


class XaseError(Exception):
    """Base exception for XASE SDK"""
    pass


class XaseAPIError(XaseError):
    """API request failed"""
    
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class XaseAuthError(XaseError):
    """Authentication failed"""
    pass


class XaseNotFoundError(XaseError):
    """Resource not found"""
    pass


class XaseValidationError(XaseError):
    """Validation error"""
    pass


class XaseRateLimitError(XaseError):
    """Rate limit exceeded"""
    pass


class XaseConnectionError(XaseError):
    """Connection error"""
    pass
