use anyhow::{Result, Context};
use std::env;

#[derive(Clone)]
pub struct Config {
    pub contract_id: String,
    pub api_key: String,
    pub base_url: String,
    pub lease_id: String,
    pub socket_path: String,
    pub cache_size_gb: usize,
    pub bucket_name: String,
    pub bucket_prefix: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            contract_id: env::var("CONTRACT_ID")
                .context("CONTRACT_ID not set")?,
            api_key: env::var("XASE_API_KEY")
                .context("XASE_API_KEY not set")?,
            base_url: env::var("XASE_BASE_URL")
                .unwrap_or_else(|_| "https://xase.ai".to_string()),
            lease_id: env::var("LEASE_ID")
                .context("LEASE_ID not set")?,
            socket_path: env::var("SOCKET_PATH")
                .unwrap_or_else(|_| "/var/run/xase/sidecar.sock".to_string()),
            cache_size_gb: env::var("CACHE_SIZE_GB")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .context("Invalid CACHE_SIZE_GB")?,
            bucket_name: env::var("BUCKET_NAME")
                .context("BUCKET_NAME not set")?,
            bucket_prefix: env::var("BUCKET_PREFIX")
                .unwrap_or_else(|_| "".to_string()),
        })
    }
}
