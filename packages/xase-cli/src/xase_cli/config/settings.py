"""Configuration management"""
import os
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class XaseSettings(BaseSettings):
    """Global CLI settings"""
    
    # Pydantic v2 settings configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API Configuration
    api_url: str = Field(
        default="http://localhost:3000",
        env="XASE_API_URL",
        description="Xase API base URL"
    )
    api_timeout: int = Field(
        default=30,
        env="XASE_TIMEOUT",
        description="API request timeout in seconds"
    )
    
    # Authentication
    token_refresh_threshold: int = Field(
        default=120,
        env="XASE_REFRESH_THRESHOLD",
        description="Seconds before expiry to trigger refresh"
    )
    
    # Download Configuration
    max_concurrent_downloads: int = Field(
        default=5,
        env="XASE_MAX_CONCURRENT",
        description="Maximum parallel downloads"
    )
    chunk_size: int = Field(
        default=8192,
        env="XASE_CHUNK_SIZE",
        description="Download chunk size in bytes"
    )
    retry_attempts: int = Field(
        default=3,
        env="XASE_RETRY_ATTEMPTS",
        description="Number of retry attempts"
    )
    
    # Storage
    cache_dir: Optional[Path] = Field(
        default=None,
        env="XASE_CACHE_DIR",
        description="Cache directory path"
    )
    temp_dir: Optional[Path] = Field(
        default=None,
        env="XASE_TEMP_DIR",
        description="Temporary files directory"
    )
    
    # Logging
    log_level: str = Field(
        default="INFO",
        env="XASE_LOG_LEVEL",
        description="Logging level"
    )

    # UI
    no_color: bool = Field(
        default=False,
        env="NO_COLOR",
        description="Disable colored output"
    )

    def get_cache_dir(self) -> Path:
        """Get cache directory, creating if needed"""
        cache_dir = self.cache_dir or Path.home() / ".xase" / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir
    
    def get_temp_dir(self) -> Path:
        """Get temp directory, creating if needed"""
        temp_dir = self.temp_dir or Path.home() / ".xase" / "tmp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        return temp_dir


# Global settings instance
settings = XaseSettings()
