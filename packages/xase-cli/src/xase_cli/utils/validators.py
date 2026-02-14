"""Input validation with Pydantic"""
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, ConfigDict


class StreamConfig(BaseModel):
    """Configuration for streaming dataset"""
    
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    dataset_id: str = Field(..., pattern=r'^ds_[a-z0-9]{24}$')
    lease_id: str = Field(..., pattern=r'^lease_[a-z0-9]{24}$')
    env: Literal['development', 'staging', 'production'] = 'production'
    estimated_hours: float = Field(0.5, ge=0.01, le=100)
    output: Path
    
    @field_validator('output')
    @classmethod
    def validate_output_path(cls, v):
        """Ensure output path is valid and parent exists"""
        if v.exists() and not v.is_file():
            raise ValueError(f"{v} exists and is not a file")
        v.parent.mkdir(parents=True, exist_ok=True)
        return v


class LeaseConfig(BaseModel):
    """Configuration for creating lease"""
    
    dataset_id: str = Field(..., pattern=r'^ds_[a-z0-9]{24}$')
    ttl_seconds: int = Field(1800, ge=60, le=86400)  # 1min to 24h
    
    @field_validator('ttl_seconds')
    @classmethod
    def validate_ttl(cls, v):
        """Ensure TTL is reasonable"""
        if v < 60:
            raise ValueError("TTL must be at least 60 seconds")
        if v > 86400:
            raise ValueError("TTL cannot exceed 24 hours")
        return v


class LoginConfig(BaseModel):
    """Configuration for login"""
    
    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    code: Optional[str] = Field(None, pattern=r'^\d{6}$')
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        """Basic email validation"""
        if '@' not in v or '.' not in v.split('@')[1]:
            raise ValueError("Invalid email format")
        return v.lower()
