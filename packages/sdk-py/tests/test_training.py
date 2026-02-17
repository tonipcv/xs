"""
Tests for GovernedDataset in xase.training module
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import threading
import queue

# Mock torch if not available
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None


@pytest.fixture
def mock_httpx_client():
    """Mock httpx.Client for testing"""
    with patch('xase.training.httpx.Client') as mock_client_class:
        mock_client = Mock()
        mock_client_class.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_lease_response():
    """Mock lease creation response"""
    return {"leaseId": "lease_test123"}


@pytest.fixture
def mock_stream_response():
    """Mock dataset stream response"""
    return {
        "batch": [
            {"key": "audio1.wav", "url": "https://example.com/audio1.wav"},
            {"key": "audio2.wav", "url": "https://example.com/audio2.wav"},
        ],
        "nextCursor": "cursor_abc123"
    }


@pytest.fixture
def mock_empty_stream_response():
    """Mock empty stream response (end of dataset)"""
    return {"batch": [], "nextCursor": None}


def test_governed_dataset_initialization():
    """Test GovernedDataset initialization with default parameters"""
    from xase.training import GovernedDataset
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123",
        base_url="http://localhost:3000"
    )
    
    assert ds.api_key == "xase_test_key"
    assert ds.dataset_id == "ds_test123"
    assert ds.base_url == "http://localhost:3000"
    assert ds.batch_limit == 64
    assert ds.prefetch_batches == 5
    assert ds.lease_ttl_seconds == 900
    assert ds.estimated_hours_per_batch == 0.5


def test_governed_dataset_custom_parameters():
    """Test GovernedDataset with custom parameters"""
    from xase.training import GovernedDataset
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123",
        base_url="https://api.xase.io",
        batch_limit=128,
        prefetch_batches=10,
        lease_ttl_seconds=1800,
        estimated_hours_per_batch=1.0,
        client_timeout=30.0
    )
    
    assert ds.batch_limit == 128
    assert ds.prefetch_batches == 10
    assert ds.lease_ttl_seconds == 1800
    assert ds.estimated_hours_per_batch == 1.0
    assert ds.client_timeout == 30.0


def test_governed_dataset_mint_lease(mock_httpx_client, mock_lease_response):
    """Test lease minting"""
    from xase.training import GovernedDataset
    
    mock_response = Mock()
    mock_response.json.return_value = mock_lease_response
    mock_httpx_client.post.return_value = mock_response
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123"
    )
    
    lease_id = ds._mint_lease()
    
    assert lease_id == "lease_test123"
    mock_httpx_client.post.assert_called_once()
    call_args = mock_httpx_client.post.call_args
    assert "/api/v1/leases" in call_args[0][0]
    assert call_args[1]["headers"]["X-API-Key"] == "xase_test_key"
    assert call_args[1]["json"]["datasetId"] == "ds_test123"


def test_governed_dataset_iteration(mock_httpx_client, mock_lease_response, mock_stream_response, mock_empty_stream_response):
    """Test dataset iteration with prefetching"""
    from xase.training import GovernedDataset
    
    # Mock lease creation
    lease_mock = Mock()
    lease_mock.json.return_value = mock_lease_response
    
    # Mock stream responses: first batch, then empty
    stream_mock_1 = Mock()
    stream_mock_1.status_code = 200
    stream_mock_1.json.return_value = mock_stream_response
    
    stream_mock_2 = Mock()
    stream_mock_2.status_code = 200
    stream_mock_2.json.return_value = mock_empty_stream_response
    
    mock_httpx_client.post.return_value = lease_mock
    mock_httpx_client.get.side_effect = [stream_mock_1, stream_mock_2]
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123",
        batch_limit=2,
        prefetch_batches=1
    )
    
    batches = list(ds)
    
    assert len(batches) == 1
    assert len(batches[0]) == 2
    assert batches[0][0]["key"] == "audio1.wav"
    assert batches[0][1]["key"] == "audio2.wav"
    
    ds.shutdown()


def test_governed_dataset_lease_expired(mock_httpx_client, mock_lease_response):
    """Test handling of expired lease (403 response)"""
    from xase.training import GovernedDataset
    
    lease_mock = Mock()
    lease_mock.json.return_value = mock_lease_response
    
    stream_mock = Mock()
    stream_mock.status_code = 403
    
    mock_httpx_client.post.return_value = lease_mock
    mock_httpx_client.get.return_value = stream_mock
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123",
        prefetch_batches=1
    )
    
    batches = list(ds)
    
    # Should return empty when lease expires
    assert len(batches) == 0
    
    ds.shutdown()


def test_governed_dataset_context_manager(mock_httpx_client, mock_lease_response, mock_empty_stream_response):
    """Test GovernedDataset as context manager"""
    from xase.training import GovernedDataset
    
    lease_mock = Mock()
    lease_mock.json.return_value = mock_lease_response
    
    stream_mock = Mock()
    stream_mock.status_code = 200
    stream_mock.json.return_value = mock_empty_stream_response
    
    mock_httpx_client.post.return_value = lease_mock
    mock_httpx_client.get.return_value = stream_mock
    
    with GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123"
    ) as ds:
        assert ds is not None
        list(ds)  # Consume iterator
    
    # Shutdown should be called automatically
    assert ds._stop_event.is_set()


def test_batch_prefetcher_fetch_once(mock_httpx_client, mock_stream_response):
    """Test _BatchPrefetcher._fetch_once method"""
    from xase.training import _BatchPrefetcher
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_stream_response
    mock_httpx_client.get.return_value = mock_response
    
    stop_event = threading.Event()
    prefetcher = _BatchPrefetcher(
        api_key="xase_test_key",
        base_url="http://localhost:3000",
        dataset_id="ds_test123",
        batch_limit=64,
        estimated_hours_per_batch=0.5,
        prefetch_batches=5,
        lease_id="lease_test123",
        stop_event=stop_event
    )
    
    batch = prefetcher._fetch_once()
    
    assert batch is not None
    assert len(batch) == 2
    assert batch[0]["key"] == "audio1.wav"
    assert prefetcher.cursor == "cursor_abc123"


def test_batch_prefetcher_handles_error():
    """Test _BatchPrefetcher error handling"""
    from xase.training import _BatchPrefetcher
    
    with patch('xase.training.httpx.Client') as mock_client_class:
        mock_client = Mock()
        mock_client.get.side_effect = Exception("Network error")
        mock_client_class.return_value = mock_client
        
        stop_event = threading.Event()
        prefetcher = _BatchPrefetcher(
            api_key="xase_test_key",
            base_url="http://localhost:3000",
            dataset_id="ds_test123",
            batch_limit=64,
            estimated_hours_per_batch=0.5,
            prefetch_batches=1,
            lease_id="lease_test123",
            stop_event=stop_event
        )
        
        # Run in thread
        thread = threading.Thread(target=prefetcher.run)
        thread.start()
        thread.join(timeout=1.0)
        
        # Should capture exception
        assert prefetcher.exc is not None
        assert "Network error" in str(prefetcher.exc)


def test_governed_dataset_propagates_prefetcher_error(mock_httpx_client, mock_lease_response):
    """Test that GovernedDataset propagates prefetcher errors"""
    from xase.training import GovernedDataset
    
    lease_mock = Mock()
    lease_mock.json.return_value = mock_lease_response
    mock_httpx_client.post.return_value = lease_mock
    
    # Make get raise an error
    mock_httpx_client.get.side_effect = Exception("API error")
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123",
        prefetch_batches=1
    )
    
    with pytest.raises(Exception) as exc_info:
        list(ds)
    
    assert "API error" in str(exc_info.value)
    ds.shutdown()


@pytest.mark.skipif(not TORCH_AVAILABLE, reason="PyTorch not installed")
def test_governed_dataset_with_pytorch_dataloader(mock_httpx_client, mock_lease_response, mock_stream_response, mock_empty_stream_response):
    """Test GovernedDataset integration with PyTorch DataLoader"""
    from xase.training import GovernedDataset
    from torch.utils.data import DataLoader
    
    lease_mock = Mock()
    lease_mock.json.return_value = mock_lease_response
    
    stream_mock_1 = Mock()
    stream_mock_1.status_code = 200
    stream_mock_1.json.return_value = mock_stream_response
    
    stream_mock_2 = Mock()
    stream_mock_2.status_code = 200
    stream_mock_2.json.return_value = mock_empty_stream_response
    
    mock_httpx_client.post.return_value = lease_mock
    mock_httpx_client.get.side_effect = [stream_mock_1, stream_mock_2]
    
    ds = GovernedDataset(
        api_key="xase_test_key",
        dataset_id="ds_test123"
    )
    
    # batch_size=None because dataset already yields batches
    loader = DataLoader(ds, batch_size=None)
    
    batches = list(loader)
    assert len(batches) == 1
    assert len(batches[0]) == 2
    
    ds.shutdown()
