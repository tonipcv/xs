"""Custom exceptions for Xase CLI"""


class XaseError(Exception):
    """Base exception for all Xase CLI errors"""
    
    def __init__(self, message: str, code: str = None, details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(XaseError):
    """Authentication failed (401/403)"""
    pass


class RateLimitError(XaseError):
    """Rate limit exceeded (429)"""
    
    def __init__(self, retry_after: int, **kwargs):
        self.retry_after = retry_after
        super().__init__(f"Rate limited. Retry after {retry_after}s", **kwargs)


class NetworkError(XaseError):
    """Network/connection errors"""
    pass


class ValidationError(XaseError):
    """Input validation errors"""
    pass


class LeaseError(XaseError):
    """Lease-related errors"""
    pass


class DownloadError(XaseError):
    """Download-related errors"""
    pass
