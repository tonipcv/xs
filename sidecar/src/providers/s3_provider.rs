use anyhow::Result;
use aws_sdk_s3::Client;
use aws_config::BehaviorVersion;
use async_trait::async_trait;
use crate::config::Config;
use crate::data_provider::DataProvider;

/// S3Provider implements DataProvider for AWS S3 storage
/// This is the original implementation, now wrapped in the DataProvider trait
pub struct S3Provider {
    client: Client,
    bucket: String,
    prefix: String,
}

impl S3Provider {
    pub async fn new(config: &Config) -> Result<Self> {
        let aws_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let client = Client::new(&aws_config);

        Ok(Self {
            client,
            bucket: config.bucket_name.clone(),
            prefix: config.bucket_prefix.clone(),
        })
    }
    
    fn build_full_key(&self, key: &str) -> String {
        if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.prefix, key)
        }
    }
}

#[async_trait]
impl DataProvider for S3Provider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        let full_key = self.build_full_key(key);

        let resp = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await?;

        let data = resp.body.collect().await?;
        Ok(data.into_bytes().to_vec())
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        let full_prefix = if self.prefix.is_empty() {
            prefix.to_string()
        } else if prefix.is_empty() {
            self.prefix.clone()
        } else {
            format!("{}/{}", self.prefix, prefix)
        };
        
        let resp = self.client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(&full_prefix)
            .max_keys(limit as i32)
            .send()
            .await?;
        
        let mut keys = Vec::new();
        for object in resp.contents() {
            if let Some(key) = object.key() {
                // Strip the prefix to return relative keys
                let relative_key = if !self.prefix.is_empty() && key.starts_with(&self.prefix) {
                    key.strip_prefix(&format!("{}/", self.prefix))
                        .unwrap_or(key)
                        .to_string()
                } else {
                    key.to_string()
                };
                keys.push(relative_key);
            }
        }
        
        Ok(keys)
    }
    
    fn name(&self) -> &str {
        "S3"
    }
    
    async fn health_check(&self) -> Result<bool> {
        // Try to list with limit 1 to check connectivity
        match self.client
            .list_objects_v2()
            .bucket(&self.bucket)
            .max_keys(1)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                tracing::warn!("S3 health check failed: {}", e);
                Ok(false)
            }
        }
    }
}
