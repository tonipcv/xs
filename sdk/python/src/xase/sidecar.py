"""
XASE Sidecar Dataset Integration
PyTorch-compatible dataset with multi-worker support for streaming data from Sidecar
"""

import socket
import struct
import json
import time
import threading
from typing import List, Optional, Callable, Any, Iterator, Union
from enum import Enum


class DataType(Enum):
    """Supported data types"""
    AUDIO = "AUDIO"
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    TEXT = "TEXT"
    DICOM = "DICOM"


class SidecarClient:
    """
    Low-level client for communicating with Sidecar via Unix socket
    
    Handles connection, retry logic, and protocol communication
    """
    
    def __init__(
        self,
        socket_path: str = "/var/run/xase/sidecar.sock",
        max_retries: int = 3,
        backoff_base: float = 2.0,
    ):
        """
        Initialize Sidecar client
        
        Args:
            socket_path: Path to Unix socket
            max_retries: Maximum retry attempts per request
            backoff_base: Exponential backoff base in seconds
        """
        self.socket_path = socket_path
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.sock: Optional[socket.socket] = None
        self._lock = threading.Lock()
    
    def connect(self) -> None:
        """Establish connection to Sidecar"""
        if self.sock is not None:
            return
        
        with self._lock:
            if self.sock is not None:
                return
            
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.connect(self.socket_path)
            self.sock.settimeout(30.0)
    
    def close(self) -> None:
        """Close connection"""
        with self._lock:
            if self.sock is not None:
                try:
                    self.sock.close()
                except:
                    pass
                self.sock = None
    
    def _send_request(self, request: dict) -> dict:
        """Send request and receive response"""
        if self.sock is None:
            self.connect()
        
        # Serialize request
        request_bytes = json.dumps(request).encode('utf-8')
        request_len = len(request_bytes)
        
        # Send: 4-byte length + JSON payload
        self.sock.sendall(struct.pack('!I', request_len))
        self.sock.sendall(request_bytes)
        
        # Receive: 4-byte length
        len_bytes = self._recv_exact(4)
        response_len = struct.unpack('!I', len_bytes)[0]
        
        # Receive: JSON payload
        response_bytes = self._recv_exact(response_len)
        response = json.loads(response_bytes.decode('utf-8'))
        
        if response.get('status') == 'error':
            raise RuntimeError(f"Sidecar error: {response.get('message', 'Unknown error')}")
        
        return response
    
    def _recv_exact(self, n: int) -> bytes:
        """Receive exactly n bytes"""
        data = b''
        while len(data) < n:
            chunk = self.sock.recv(n - len(data))
            if not chunk:
                raise ConnectionError("Connection closed by Sidecar")
            data += chunk
        return data
    
    def get_segment(self, segment_id: str) -> bytes:
        """
        Fetch a segment with retry logic
        
        Args:
            segment_id: Segment ID to fetch
            
        Returns:
            Raw segment data (watermarked)
        """
        for attempt in range(self.max_retries):
            try:
                response = self._send_request({
                    'action': 'get_segment',
                    'segment_id': segment_id,
                })
                
                # Data is base64 encoded in response
                import base64
                return base64.b64decode(response['data'])
                
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise
                
                # Exponential backoff
                wait_time = self.backoff_base ** attempt
                time.sleep(wait_time)
                
                # Reconnect on connection errors
                if isinstance(e, (ConnectionError, BrokenPipeError)):
                    self.close()
                    self.connect()


class SidecarDataset:
    """
    PyTorch-compatible dataset that streams data from Sidecar with multi-worker support
    
    Example:
        >>> from xase.sidecar import SidecarDataset
        >>> from torch.utils.data import DataLoader
        >>> 
        >>> dataset = SidecarDataset(
        ...     segment_ids=["seg_00001", "seg_00002", ...],
        ...     socket_path="/var/run/xase/sidecar.sock",
        ...     num_connections=4  # Enable multi-worker
        ... )
        >>> 
        >>> # Now supports num_workers > 0!
        >>> loader = DataLoader(dataset, batch_size=None, num_workers=4)
        >>> for audio_data in loader:
        ...     # Process audio_data (watermarked)
        ...     pass
    """
    
    def __init__(
        self,
        segment_ids: List[str],
        socket_path: str = "/var/run/xase/sidecar.sock",
        num_connections: int = 1,
        max_retries: int = 3,
        backoff_base: float = 2.0,
        data_type: Optional[Union[str, DataType]] = None,
        transform: Optional[Callable[[bytes], Any]] = None,
    ):
        """
        Initialize Sidecar dataset with multi-worker support
        
        Args:
            segment_ids: List of segment IDs to fetch
            socket_path: Path to Unix socket
            num_connections: Number of socket connections in pool (default: 1)
            max_retries: Maximum retry attempts per request (default: 3)
            backoff_base: Exponential backoff base in seconds (default: 2.0)
            data_type: Data type hint (optional)
            transform: Optional transform function to apply to raw bytes
        """
        self.segment_ids = segment_ids
        self.socket_path = socket_path
        self.num_connections = num_connections
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self._pool: List[SidecarClient] = []
        self._pool_lock = threading.Lock()
        
        # Normalize data type to enum string (uppercased)
        if isinstance(data_type, DataType):
            self.data_type = data_type.value
        elif isinstance(data_type, str):
            dt_upper = data_type.strip().upper()
            self.data_type = DataType(dt_upper).value if dt_upper in DataType.__members__ else dt_upper
        else:
            self.data_type = None
        
        self.transform = transform
    
    def _get_client(self) -> SidecarClient:
        """Get or create a client from the pool (thread-safe)"""
        with self._pool_lock:
            if len(self._pool) < self.num_connections:
                client = SidecarClient(
                    socket_path=self.socket_path,
                    max_retries=self.max_retries,
                    backoff_base=self.backoff_base
                )
                self._pool.append(client)
                return client
            
            # Round-robin selection
            import random
            return random.choice(self._pool)
    
    def __len__(self) -> int:
        return len(self.segment_ids)
    
    def __getitem__(self, idx: int) -> Any:
        """Get segment by index, applying optional transform (thread-safe)"""
        segment_id = self.segment_ids[idx]
        client = self._get_client()
        data = client.get_segment(segment_id)
        
        if self.transform is not None:
            return self.transform(data)
        return data
    
    def __iter__(self) -> Iterator[Any]:
        """Iterate over segments with auto-recovery and optional transform"""
        client = self._get_client()
        client.connect()
        try:
            for segment_id in self.segment_ids:
                data = client.get_segment(segment_id)
                if self.transform is not None:
                    yield self.transform(data)
                else:
                    yield data
        finally:
            # Don't close - keep in pool for reuse
            pass
    
    def close_all(self) -> None:
        """Close all connections in pool"""
        with self._pool_lock:
            for client in self._pool:
                client.close()
            self._pool.clear()


# Example transforms for common use cases
def audio_to_numpy(data: bytes):
    """Transform raw audio bytes to numpy array"""
    import numpy as np
    import io
    import soundfile as sf
    
    audio, sample_rate = sf.read(io.BytesIO(data))
    return audio, sample_rate


def image_to_pil(data: bytes):
    """Transform raw image bytes to PIL Image"""
    from PIL import Image
    import io
    
    return Image.open(io.BytesIO(data))


def image_to_tensor(data: bytes):
    """Transform raw image bytes to PyTorch tensor"""
    import torch
    from torchvision import transforms
    from PIL import Image
    import io
    
    img = Image.open(io.BytesIO(data))
    to_tensor = transforms.ToTensor()
    return to_tensor(img)
