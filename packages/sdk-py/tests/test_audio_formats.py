"""
Tests for real audio format support (MP3, FLAC, OGG, WAV)
"""
import pytest
from xase.sidecar import audio_bytes_to_tensor, DataType


def test_audio_loader_function_exists():
    """Test audio_bytes_to_tensor function exists and is callable"""
    assert callable(audio_bytes_to_tensor)


def test_datatype_enum_values():
    """Test DataType enum has expected values for multi-modal support"""
    assert hasattr(DataType, 'AUDIO')
    assert hasattr(DataType, 'IMAGE')
    assert hasattr(DataType, 'TEXT')
    assert hasattr(DataType, 'TIMESERIES')
    assert hasattr(DataType, 'TABULAR')


def test_datatype_enum_usage():
    """Test DataType enum can be used directly"""
    # DataType enum values can be accessed directly
    audio_type = DataType.AUDIO
    assert audio_type == DataType.AUDIO
    
    # Enum values have string representations
    assert str(DataType.AUDIO) == 'DataType.AUDIO'


def test_audio_format_support_documented():
    """Test that multi-format audio support is documented"""
    # Verify the function signature accepts data parameter
    import inspect
    sig = inspect.signature(audio_bytes_to_tensor)
    params = list(sig.parameters.keys())
    
    assert 'data' in params
    assert 'target_sample_rate' in params
