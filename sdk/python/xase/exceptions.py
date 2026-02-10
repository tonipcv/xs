"""
Xase SDK Exceptions
"""


class XaseError(Exception):
    """Base exception for Xase SDK"""
    
    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class AuthenticationError(XaseError):
    """Raised when authentication fails"""
    pass


class PolicyViolationError(XaseError):
    """Raised when a query violates policy"""
    pass


class QueryError(XaseError):
    """Raised when query execution fails"""
    pass
