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
from datetime import datetime


class SidecarClient:
    """Client for communicating with Xase Sidecar via Unix socket."""
    
    def __init__(self, socket_path: str = "/var/run/xase/sidecar.sock"):
        """
        Initialize Sidecar client.
        
        Args:
            socket_path: Path to Unix socket (default: /var/run/xase/sidecar.sock)
        """
        self.socket_path = socket_path
        self.sock: Optional[socket.socket] = None
    
    def connect(self) -> None:
        """Connect to Sidecar Unix socket."""
        if self.sock is not None:
            return
        
        if not os.path.exists(self.socket_path):
            raise FileNotFoundError(
                f"Sidecar socket not found at {self.socket_path}. "
                "Is the Sidecar running?"
            )
        
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)
    
    def get_segment(self, segment_id: str) -> bytes:
        """
        Get audio segment from Sidecar.
        
        Args:
            segment_id: Segment identifier (e.g., "seg_00123")
        
        Returns:
            Audio data (watermarked)
        """
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
    PyTorch-compatible dataset that streams data from Sidecar.
    
    Example:
        >>> from xase.sidecar import SidecarDataset
        >>> from torch.utils.data import DataLoader
        >>> 
        >>> dataset = SidecarDataset(
        ...     segment_ids=["seg_00001", "seg_00002", ...],
        ...     socket_path="/var/run/xase/sidecar.sock"
        ... )
        >>> 
        >>> loader = DataLoader(dataset, batch_size=None, num_workers=0)
        >>> for audio_data in loader:
        ...     # Process audio_data (watermarked)
        ...     pass
    """
    
    def __init__(
        self,
        segment_ids: list[str],
        socket_path: str = "/var/run/xase/sidecar.sock",
    ):
        """
        Initialize Sidecar dataset.
        
        Args:
            segment_ids: List of segment IDs to fetch
            socket_path: Path to Unix socket
        """
        self.segment_ids = segment_ids
        self.socket_path = socket_path
        self.client = SidecarClient(socket_path)
    
    def __len__(self) -> int:
        return len(self.segment_ids)
    
    def __getitem__(self, idx: int) -> bytes:
        """Get segment by index."""
        segment_id = self.segment_ids[idx]
        return self.client.get_segment(segment_id)
    
    def __iter__(self) -> Iterator[bytes]:
        """Iterate over segments."""
        self.client.connect()
        try:
            for segment_id in self.segment_ids:
                yield self.client.get_segment(segment_id)
        finally:
            self.client.close()
