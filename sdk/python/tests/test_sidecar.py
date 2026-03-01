"""
Tests for SidecarDataset and SidecarClient
"""

import pytest
import socket
import threading
import json
import struct
import base64
from xase.sidecar import SidecarDataset, SidecarClient, DataType


class MockSidecarServer:
    """Mock Sidecar server for testing"""
    
    def __init__(self, socket_path):
        self.socket_path = socket_path
        self.server = None
        self.running = False
        self.thread = None
    
    def start(self):
        """Start mock server"""
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            import os
            if os.path.exists(self.socket_path):
                os.unlink(self.socket_path)
        except:
            pass
        
        self.server.bind(self.socket_path)
        self.server.listen(5)
        self.running = True
        
        self.thread = threading.Thread(target=self._serve)
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        """Stop mock server"""
        self.running = False
        if self.server:
            self.server.close()
        if self.thread:
            self.thread.join(timeout=1)
    
    def _serve(self):
        """Serve requests"""
        while self.running:
            try:
                conn, _ = self.server.accept()
                threading.Thread(target=self._handle_client, args=(conn,), daemon=True).start()
            except:
                break
    
    def _handle_client(self, conn):
        """Handle client connection"""
        try:
            while self.running:
                # Read request length
                len_bytes = conn.recv(4)
                if not len_bytes:
                    break
                
                request_len = struct.unpack('!I', len_bytes)[0]
                
                # Read request
                request_bytes = b''
                while len(request_bytes) < request_len:
                    chunk = conn.recv(request_len - len(request_bytes))
                    if not chunk:
                        break
                    request_bytes += chunk
                
                request = json.loads(request_bytes.decode('utf-8'))
                
                # Generate response
                if request['action'] == 'get_segment':
                    segment_id = request['segment_id']
                    # Mock audio data
                    mock_data = f"mock_audio_data_{segment_id}".encode('utf-8')
                    response = {
                        'status': 'ok',
                        'data': base64.b64encode(mock_data).decode('utf-8'),
                    }
                else:
                    response = {
                        'status': 'error',
                        'message': 'Unknown action',
                    }
                
                # Send response
                response_bytes = json.dumps(response).encode('utf-8')
                response_len = len(response_bytes)
                conn.sendall(struct.pack('!I', response_len))
                conn.sendall(response_bytes)
        except:
            pass
        finally:
            conn.close()


@pytest.fixture
def mock_server():
    """Create mock Sidecar server"""
    import tempfile
    socket_path = tempfile.mktemp(suffix=".sock", prefix="xase_")
    server = MockSidecarServer(socket_path)
    server.start()
    yield socket_path
    server.stop()
    import os
    try:
        os.unlink(socket_path)
    except:
        pass


def test_sidecar_client_basic(mock_server):
    """Test basic SidecarClient functionality"""
    client = SidecarClient(socket_path=mock_server)
    client.connect()
    
    data = client.get_segment("seg_001")
    assert data == b"mock_audio_data_seg_001"
    
    client.close()


def test_sidecar_dataset_basic(mock_server):
    """Test basic SidecarDataset functionality"""
    segment_ids = ["seg_001", "seg_002", "seg_003"]
    dataset = SidecarDataset(
        segment_ids=segment_ids,
        socket_path=mock_server,
    )
    
    assert len(dataset) == 3
    
    # Test __getitem__
    data = dataset[0]
    assert data == b"mock_audio_data_seg_001"
    
    # Test __iter__
    all_data = list(dataset)
    assert len(all_data) == 3
    assert all_data[0] == b"mock_audio_data_seg_001"
    assert all_data[1] == b"mock_audio_data_seg_002"
    assert all_data[2] == b"mock_audio_data_seg_003"
    
    dataset.close_all()


def test_sidecar_dataset_with_transform(mock_server):
    """Test SidecarDataset with transform function"""
    def uppercase_transform(data: bytes) -> str:
        return data.decode('utf-8').upper()
    
    segment_ids = ["seg_001"]
    dataset = SidecarDataset(
        segment_ids=segment_ids,
        socket_path=mock_server,
        transform=uppercase_transform,
    )
    
    data = dataset[0]
    assert data == "MOCK_AUDIO_DATA_SEG_001"
    
    dataset.close_all()


def test_sidecar_dataset_multiworker(mock_server):
    """Test SidecarDataset with multiple connections"""
    segment_ids = [f"seg_{i:03d}" for i in range(10)]
    dataset = SidecarDataset(
        segment_ids=segment_ids,
        socket_path=mock_server,
        num_connections=3,  # Pool of 3 connections
    )
    
    # Fetch all segments (should use connection pool)
    all_data = []
    for i in range(len(dataset)):
        data = dataset[i]
        all_data.append(data)
    
    assert len(all_data) == 10
    assert all_data[0] == b"mock_audio_data_seg_000"
    assert all_data[9] == b"mock_audio_data_seg_009"
    
    dataset.close_all()


def test_data_type_enum():
    """Test DataType enum"""
    assert DataType.AUDIO.value == "AUDIO"
    assert DataType.IMAGE.value == "IMAGE"
    assert DataType.DICOM.value == "DICOM"


def test_sidecar_dataset_with_data_type(mock_server):
    """Test SidecarDataset with data_type parameter"""
    segment_ids = ["seg_001"]
    
    # Test with enum
    dataset1 = SidecarDataset(
        segment_ids=segment_ids,
        socket_path=mock_server,
        data_type=DataType.AUDIO,
    )
    assert dataset1.data_type == "AUDIO"
    
    # Test with string
    dataset2 = SidecarDataset(
        segment_ids=segment_ids,
        socket_path=mock_server,
        data_type="audio",
    )
    assert dataset2.data_type == "AUDIO"
    
    dataset1.close_all()
    dataset2.close_all()
