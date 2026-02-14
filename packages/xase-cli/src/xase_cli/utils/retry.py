"""Retry logic with exponential backoff"""
import time
from functools import wraps
from typing import Callable, Type, Tuple

from ..errors.exceptions import NetworkError, RateLimitError
from .logger import get_logger

logger = get_logger(__name__)


def retry_with_backoff(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 10.0,
    exponential_base: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (NetworkError,)
):
    """Decorator for retrying with exponential backoff"""
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exception = None
            
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                
                except RateLimitError as e:
                    # Special handling for rate limits
                    if attempt == max_attempts:
                        raise
                    
                    wait_time = e.retry_after
                    logger.warning(
                        f"Rate limited. Waiting {wait_time}s before retry "
                        f"(attempt {attempt}/{max_attempts})"
                    )
                    time.sleep(wait_time)
                    last_exception = e
                
                except exceptions as e:
                    if attempt == max_attempts:
                        raise
                    
                    logger.warning(
                        f"Attempt {attempt}/{max_attempts} failed: {e}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)
                    delay = min(delay * exponential_base, max_delay)
                    last_exception = e
            
            # Should not reach here, but just in case
            if last_exception:
                raise last_exception
        
        return wrapper
    return decorator
