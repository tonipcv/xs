"""
XASE Sidecar Integration for Python SDK

Provides Unix socket communication with Sidecar for high-performance data access.
"""
import socket
import struct
from typing import Optional, Iterator, List, Dict, Any
import os
import time
import threading
import requests
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class SidecarClient:
    """Client for communicating with Xase Sidecar via Unix socket with auto-recovery."""
    
    def __init__(
        self, 
        socket_path: str = "/var/run/xase/sidecar.sock",
        max_retries: int = 3,
        backoff_base: float = 2.0,
        timeout: float = 30.0
    ):
        """
        Initialize Sidecar client with auto-recovery.
        
        Args:
            socket_path: Path to Unix socket (default: /var/run/xase/sidecar.sock)
            max_retries: Maximum number of retry attempts (default: 3)
            backoff_base: Base for exponential backoff in seconds (default: 2.0)
            timeout: Socket timeout in seconds (default: 30.0)
        """
        self.socket_path = socket_path
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.timeout = timeout
        self.sock: Optional[socket.socket] = None
        self._connection_attempts = 0
    
    def connect(self) -> None:
        """Connect to Sidecar Unix socket with retry logic."""
        if self.sock is not None:
            return
        
        for attempt in range(self.max_retries):
            try:
                if not os.path.exists(self.socket_path):
                    raise FileNotFoundError(
                        f"Sidecar socket not found at {self.socket_path}. "
                        "Is the Sidecar running?"
                    )
                
                self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self.sock.settimeout(self.timeout)
                self.sock.connect(self.socket_path)
                self._connection_attempts = 0
                logger.info(f"Connected to Sidecar at {self.socket_path}")
                return
                
            except (ConnectionError, FileNotFoundError, socket.error) as e:
                self._connection_attempts += 1
                if self.sock:
                    self.sock.close()
                    self.sock = None
                
                if attempt < self.max_retries - 1:
                    wait_time = self.backoff_base ** attempt
                    logger.warning(
                        f"Connection attempt {attempt + 1}/{self.max_retries} failed: {e}. "
                        f"Retrying in {wait_time:.1f}s..."
                    )
                    time.sleep(wait_time)
                else:
                    logger.error(f"Failed to connect after {self.max_retries} attempts")
                    raise
    
    def get_segment(self, segment_id: str) -> bytes:
        """
        Get audio segment from Sidecar with auto-recovery.
        
        Args:
            segment_id: Segment identifier (e.g., "seg_00123")
        
        Returns:
            Audio data (watermarked)
        
        Raises:
            ConnectionError: If unable to fetch segment after retries
        """
        for attempt in range(self.max_retries):
            try:
                if self.sock is None:
                    self.connect()
                
                # Send request (length-prefixed)
                segment_bytes = segment_id.encode('utf-8')
                length = struct.pack('>I', len(segment_bytes))
                self.sock.sendall(length + segment_bytes)
                
                # Receive response (length-prefixed)
                length_bytes = self._recv_exact(4)
                data_length = struct.unpack('>I', length_bytes)[0]
                data = self._recv_exact(data_length)
                
                return data
                
            except (ConnectionError, socket.error, BrokenPipeError, TimeoutError) as e:
                logger.warning(
                    f"Failed to get segment {segment_id} (attempt {attempt + 1}/{self.max_retries}): {e}"
                )
                
                # Close and reset connection
                if self.sock:
                    self.sock.close()
                    self.sock = None
                
                if attempt < self.max_retries - 1:
                    wait_time = self.backoff_base ** attempt
                    logger.info(f"Reconnecting in {wait_time:.1f}s...")
                    time.sleep(wait_time)
                    self.connect()
                else:
                    logger.error(f"Failed to get segment {segment_id} after {self.max_retries} attempts")
                    raise ConnectionError(
                        f"Unable to fetch segment {segment_id} after {self.max_retries} retries"
                    )
    
    def _recv_exact(self, n: int) -> bytes:
        """Receive exactly n bytes from socket."""
        data = b''
        while len(data) < n:
            chunk = self.sock.recv(n - len(data))
            if not chunk:
                raise ConnectionError("Socket connection closed")
            data += chunk
        return data
    
    def close(self) -> None:
        """Close socket connection."""
        if self.sock is not None:
            self.sock.close()
            self.sock = None
    
    def __enter__(self):
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class TelemetrySender:
    """Sends telemetry data to Xase Brain."""
    
    def __init__(
        self,
        session_id: str,
        api_key: str,
        base_url: str = "https://xase.ai",
        batch_size: int = 100,
        flush_interval: float = 10.0,
    ):
        self.session_id = session_id
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.logs: List[Dict[str, Any]] = []
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
    
    def start(self) -> None:
        """Start background telemetry sender."""
        if self.thread is not None:
            return
        self.thread = threading.Thread(target=self._flush_loop, daemon=True)
        self.thread.start()
    
    def log(
        self,
        segment_id: str,
        event_type: str,
        bytes_processed: Optional[int] = None,
        latency_ms: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log a telemetry event."""
        log_entry = {
            "segmentId": segment_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "eventType": event_type,
        }
        if bytes_processed is not None:
            log_entry["bytesProcessed"] = bytes_processed
        if latency_ms is not None:
            log_entry["latencyMs"] = latency_ms
        if metadata is not None:
            log_entry["metadata"] = metadata
        
        with self.lock:
            self.logs.append(log_entry)
            if len(self.logs) >= self.batch_size:
                self._flush()
    
    def _flush(self) -> None:
        """Flush logs to Brain (must be called with lock held)."""
        if not self.logs:
            return
        
        batch = self.logs[:]
        self.logs.clear()
        
        try:
            response = requests.post(
                f"{self.base_url}/api/v1/sidecar/telemetry",
                json={"sessionId": self.session_id, "logs": batch},
                headers={"X-API-Key": self.api_key},
                timeout=5.0,
            )
            response.raise_for_status()
        except Exception as e:
            print(f"Telemetry flush failed: {e}")
    
    def _flush_loop(self) -> None:
        """Background loop to flush periodically."""
        while not self.stop_event.is_set():
            time.sleep(self.flush_interval)
            with self.lock:
                self._flush()
    
    def stop(self) -> None:
        """Stop telemetry sender and flush remaining logs."""
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=2.0)
        with self.lock:
            self._flush()


class WatermarkDetector:
    """Detect watermarks in audio files."""
    
    def __init__(self, api_key: str, base_url: str = "https://xase.ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
    
    def detect(self, audio_data: bytes) -> Optional[Dict[str, Any]]:
        """
        Detect watermark in audio data.
        
        Args:
            audio_data: Audio file bytes
        
        Returns:
            Detection result with contract_id and confidence, or None if no watermark
        """
        try:
            response = requests.post(
                f"{self.base_url}/api/v1/watermark/detect",
                files={"audio": ("audio.wav", audio_data, "audio/wav")},
                headers={"X-API-Key": self.api_key},
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()
            
            if result.get("detected"):
                return {
                    "contract_id": result.get("contractId"),
                    "confidence": result.get("confidence"),
                    "timestamp": result.get("timestamp"),
                }
            return None
        except Exception as e:
            print(f"Watermark detection failed: {e}")
            return None


class SidecarDataset:
    """
    PyTorch-compatible dataset that streams data from Sidecar with multi-worker support.
    
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
        segment_ids: list[str],
        socket_path: str = "/var/run/xase/sidecar.sock",
        num_connections: int = 1,
        max_retries: int = 3,
        backoff_base: float = 2.0,
    ):
        """
        Initialize Sidecar dataset with multi-worker support.
        
        Args:
            segment_ids: List of segment IDs to fetch
            socket_path: Path to Unix socket
            num_connections: Number of socket connections in pool (default: 1)
            max_retries: Maximum retry attempts per request (default: 3)
            backoff_base: Exponential backoff base in seconds (default: 2.0)
        """
        self.segment_ids = segment_ids
        self.socket_path = socket_path
        self.num_connections = num_connections
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self._pool: List[SidecarClient] = []
        self._pool_lock = threading.Lock()
    
    def _get_client(self) -> SidecarClient:
        """Get or create a client from the pool (thread-safe)."""
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
    
    def __getitem__(self, idx: int) -> bytes:
        """Get segment by index (thread-safe for DataLoader multi-worker)."""
        segment_id = self.segment_ids[idx]
        client = self._get_client()
        return client.get_segment(segment_id)
    
    def __iter__(self) -> Iterator[bytes]:
        """Iterate over segments with auto-recovery."""
        client = self._get_client()
        client.connect()
        try:
            for segment_id in self.segment_ids:
                yield client.get_segment(segment_id)
        finally:
            # Don't close - keep in pool for reuse
            pass
    
    def close_all(self) -> None:
        """Close all connections in pool."""
        with self._pool_lock:
            for client in self._pool:
                client.close()
            self._pool.clear()
