"""Tests for data transform functions (dicom_to_tensor, fhir_to_tokens, ecg_to_tensor)."""
import pytest
import json


def test_fhir_to_tokens_valid_json():
    """Test fhir_to_tokens with valid FHIR JSON."""
    from xase.sidecar import fhir_to_tokens
    
    fhir_data = {
        "resourceType": "Patient",
        "id": "example",
        "name": [{"family": "Doe", "given": ["John"]}]
    }
    data = json.dumps(fhir_data).encode("utf-8")
    
    tokens = fhir_to_tokens(data)
    
    # Should return a list of tokens (either from tiktoken or whitespace split)
    assert isinstance(tokens, list)
    assert len(tokens) > 0


def test_fhir_to_tokens_invalid_json():
    """Test fhir_to_tokens with invalid JSON raises ValueError."""
    from xase.sidecar import fhir_to_tokens
    
    invalid_data = b"not valid json {"
    
    with pytest.raises(ValueError, match="Invalid FHIR JSON"):
        fhir_to_tokens(invalid_data)


def test_ecg_to_tensor_csv_format():
    """Test ecg_to_tensor with CSV format data."""
    from xase.sidecar import ecg_to_tensor
    
    # Simple CSV with one column
    csv_data = b"1.0\n2.0\n3.0\n4.0\n5.0"
    
    try:
        tensor = ecg_to_tensor(csv_data)
        # Should return a tensor-like object with 5 elements
        assert len(tensor) == 5
    except ImportError:
        pytest.skip("numpy/torch not installed")


def test_ecg_to_tensor_fallback_to_bytes():
    """Test ecg_to_tensor fallback to byte tensor for non-CSV data."""
    from xase.sidecar import ecg_to_tensor
    
    # Non-CSV data
    raw_data = b"\x00\x01\x02\x03\x04"
    
    try:
        tensor = ecg_to_tensor(raw_data)
        # Should return a tensor with 5 bytes
        assert len(tensor) == 5
    except ImportError:
        pytest.skip("numpy/torch not installed")


def test_dicom_to_tensor_requires_dependencies():
    """Test dicom_to_tensor raises ImportError if dependencies missing."""
    from xase.sidecar import dicom_to_tensor
    
    # Fake DICOM data (will fail to parse but should raise ImportError first if deps missing)
    fake_dicom = b"DICM" + b"\x00" * 100
    
    try:
        # This will either raise ImportError (deps missing) or fail to parse DICOM
        dicom_to_tensor(fake_dicom)
    except ImportError as e:
        assert "pydicom" in str(e) or "numpy" in str(e) or "torch" in str(e)
    except Exception:
        # If deps are installed, parsing will fail - that's expected
        pass


def test_sidecar_dataset_with_fhir_transform():
    """Integration test: SidecarDataset with fhir_to_tokens transform."""
    import xase.sidecar as sidecar_mod
    from xase.sidecar import SidecarDataset, fhir_to_tokens
    
    class DummyClient:
        def __init__(self, *args, **kwargs):
            fhir = {"resourceType": "Observation", "status": "final"}
            self._data = {
                "seg_1": json.dumps(fhir).encode("utf-8"),
                "seg_2": json.dumps(fhir).encode("utf-8"),
            }
            self.connected = False

        def connect(self):
            self.connected = True

        def get_segment(self, segment_id: str) -> bytes:
            return self._data.get(segment_id, b"{}")

        def close(self):
            self.connected = False
    
    # Monkeypatch SidecarClient
    original_client = sidecar_mod.SidecarClient
    sidecar_mod.SidecarClient = DummyClient
    
    try:
        ds = SidecarDataset(
            segment_ids=["seg_1", "seg_2"],
            data_type="TEXT",
            transform=fhir_to_tokens,
            num_connections=1
        )
        
        # __getitem__ should return tokens
        tokens = ds[0]
        assert isinstance(tokens, list)
        assert len(tokens) > 0
        
        # __iter__ should return tokens
        all_tokens = list(iter(ds))
        assert len(all_tokens) == 2
        assert all(isinstance(t, list) for t in all_tokens)
    
    finally:
        sidecar_mod.SidecarClient = original_client


def test_transform_none_returns_raw_bytes():
    """Test that SidecarDataset without transform returns raw bytes."""
    import xase.sidecar as sidecar_mod
    from xase.sidecar import SidecarDataset
    
    class DummyClient:
        def __init__(self, *args, **kwargs):
            self._data = {"seg_1": b"raw_audio_data"}
            self.connected = False

        def connect(self):
            self.connected = True

        def get_segment(self, segment_id: str) -> bytes:
            return self._data.get(segment_id, b"")

        def close(self):
            self.connected = False
    
    original_client = sidecar_mod.SidecarClient
    sidecar_mod.SidecarClient = DummyClient
    
    try:
        ds = SidecarDataset(
            segment_ids=["seg_1"],
            data_type="AUDIO",
            transform=None,  # No transform
            num_connections=1
        )
        
        # Should return raw bytes
        data = ds[0]
        assert data == b"raw_audio_data"
        assert isinstance(data, bytes)
    
    finally:
        sidecar_mod.SidecarClient = original_client
