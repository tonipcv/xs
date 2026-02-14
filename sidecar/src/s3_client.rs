use anyhow::Result;
use aws_sdk_s3::Client;
use aws_config::BehaviorVersion;
use crate::config::Config;

pub struct S3Client {
    client: Client,
    bucket: String,
    prefix: String,
}

impl S3Client {
    pub async fn new(config: &Config) -> Result<Self> {
        let aws_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let client = Client::new(&aws_config);

        Ok(Self {
            client,
            bucket: config.bucket_name.clone(),
            prefix: config.bucket_prefix.clone(),
        })
    }

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
