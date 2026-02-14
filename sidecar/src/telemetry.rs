use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::time::sleep;
use crate::config::Config;

#[derive(Serialize, Deserialize)]
pub struct AuthResponse {
    pub sts_token: String,
    pub session_id: String,
    pub expires_at: String,
}

#[derive(Serialize)]
struct AuthRequest {
    lease_id: String,
}

pub async fn authenticate(config: &Config) -> Result<AuthResponse> {
    let client = reqwest::Client::new();
    
    let resp = client
        .post(format!("{}/api/v1/sidecar/auth", config.base_url))
        .header("X-API-Key", &config.api_key)
        .json(&AuthRequest {
            lease_id: config.lease_id.clone(),
        })
        .send()
        .await?;

    let auth: AuthResponse = resp.json().await?;
    Ok(auth)
}

pub async fn telemetry_loop(config: Config, session_id: String) -> Result<()> {
    let client = reqwest::Client::new();
    
    loop {
        sleep(Duration::from_secs(10)).await;
        
        // TODO: Collect actual telemetry logs
        let logs: Vec<Value> = Vec::new();
        
        if !logs.is_empty() {
            let _resp = client
                .post(format!("{}/api/v1/sidecar/telemetry", config.base_url))
                .json(&serde_json::json!({
                    "sessionId": session_id,
                    "logs": logs,
                }))
                .send()
                .await?;
        }
    }
}

pub async fn kill_switch_loop(config: Config, session_id: String) -> Result<()> {
    let client = reqwest::Client::new();
    
    loop {
        sleep(Duration::from_secs(10)).await;
        
        let resp = client
            .get(format!("{}/api/v1/sidecar/kill-switch", config.base_url))
            .query(&[("sessionId", &session_id)])
            .send()
            .await?;

        #[derive(Deserialize)]
        struct KillSwitchResponse {
            killed: bool,
        }

        let result: KillSwitchResponse = resp.json().await?;
        
        if result.killed {
            eprintln!("❌ Kill switch activated - shutting down");
            std::process::exit(1);
        }
    }
}
