/// DEPRECATED: Legacy S3 client
/// 
/// This module is deprecated and will be removed in a future version.
/// Please use `crate::providers::S3Provider` instead, which implements
/// the `DataProvider` trait and supports advanced features like:
/// - Health checks
/// - Segment listing
/// - Integration with HybridProvider for fallback
/// - Better error handling and logging
/// 
/// Migration guide:
/// ```rust
/// // Old (deprecated):
/// use crate::s3_client::S3Client;
/// let client = S3Client::new(&config).await?;
/// let data = client.download("key").await?;
/// 
/// // New (recommended):
/// use crate::providers::S3Provider;
/// use crate::data_provider::DataProvider;
/// let provider = S3Provider::new(&config).await?;
/// let data = provider.download("key").await?;
/// ```

use anyhow::Result;
use aws_sdk_s3::Client;
use aws_config::BehaviorVersion;
use crate::config::Config;

#[deprecated(
    since = "0.2.0",
    note = "Use crate::providers::S3Provider instead. This legacy client will be removed in v1.0."
)]
pub struct S3Client {
    client: Client,
    bucket: String,
    prefix: String,
}

#[allow(deprecated)]
impl S3Client {
    #[deprecated(
        since = "0.2.0",
        note = "Use S3Provider::new() instead"
    )]
    pub async fn new(config: &Config) -> Result<Self> {
        tracing::warn!(
            "S3Client is deprecated. Please migrate to S3Provider for better functionality."
        );
        
        let aws_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let client = Client::new(&aws_config);

        Ok(Self {
            client,
            bucket: config.bucket_name.clone(),
            prefix: config.bucket_prefix.clone(),
        })
    }

    #[deprecated(
        since = "0.2.0",
        note = "Use DataProvider::download() on S3Provider instead"
    )]
    pub async fn download(&self, key: &str) -> Result<Vec<u8>> {
        let full_key = if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}/{}", self.prefix, key)
        };

        let resp = self.client
            .get_object()
            .bucket(&self.bucket)
            .key(&full_key)
            .send()
            .await?;

        let data = resp.body.collect().await?;
        Ok(data.into_bytes().to_vec())
    }
}
