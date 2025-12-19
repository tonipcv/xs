"""
XASE SDK - Context Capture

Captures runtime context for evidence records.
"""

import hashlib
import os
import platform
import re
import socket
import sys
from typing import Any, Dict


def capture_context() -> Dict[str, Any]:
    """Capture current runtime context."""
    return {
        "runtime": f"python@{sys.version.split()[0]}",
        "platform": platform.system(),
        "arch": platform.machine(),
        "hostname": socket.gethostname(),
        "pid": os.getpid(),
        "lib_version": "0.1.0",
        "env": os.getenv("ENV") or os.getenv("PYTHON_ENV") or "development",
        "timestamp": int(__import__("time").time() * 1000),
    }


def generate_idempotency_key(data: str) -> str:
    """Generate a stable idempotency key from data."""
    return hashlib.sha256(data.encode()).hexdigest()[:32]


def is_valid_idempotency_key(key: str) -> bool:
    """Validate idempotency key format."""
    # UUID v4
    uuid_pattern = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        re.IGNORECASE,
    )
    if uuid_pattern.match(key):
        return True
    
    # Alphanumeric 16-64 chars
    alphanumeric_pattern = re.compile(r"^[a-zA-Z0-9_-]{16,64}$")
    return bool(alphanumeric_pattern.match(key))
