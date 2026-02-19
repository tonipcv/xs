"""
Tests for multi-worker SidecarDataset functionality
"""
import pytest
from xase.sidecar import SidecarDataset


def test_sidecar_dataset_initialization():
    """Test SidecarDataset can be initialized"""
    dataset = SidecarDataset(
        segment_ids=["seg_001", "seg_002", "seg_003"],
        socket_path="/tmp/test.sock",
        num_connections=1
    )
    
    assert dataset is not None
    assert hasattr(dataset, '__iter__')


def test_sidecar_dataset_multi_worker_config():
    """Test SidecarDataset accepts multi-worker configuration"""
    dataset = SidecarDataset(
        segment_ids=[f"seg_{i:03d}" for i in range(16)],
        socket_path="/tmp/test.sock",
        num_connections=4
    )
    
    assert dataset is not None
    # Verify configuration is stored
    assert hasattr(dataset, 'segment_ids')


def test_sidecar_dataset_retry_config():
    """Test SidecarDataset accepts retry configuration"""
    dataset = SidecarDataset(
        segment_ids=["seg_001"],
        socket_path="/tmp/test.sock",
        max_retries=5,
        backoff_base=2.5
    )
    
    assert dataset is not None
