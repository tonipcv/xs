use anyhow::{Result, Context};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::types::{Payer, RequestPayer, RequestPaymentConfiguration};

/// Módulo para gerenciar S3 Requester Pays
/// 
/// Problema: Quando Data Holder (AWS) vende para AI Lab (Azure),
/// o egress é cobrado do Data Holder, podendo comer 60% do lucro.
/// 
/// Solução: Habilitar "Requester Pays" no bucket S3.
/// O comprador (AI Lab) assume o custo de egress.

/// Habilita Requester Pays em um bucket S3
pub async fn enable_requester_pays(client: &S3Client, bucket: &str) -> Result<()> {
    client
        .put_bucket_request_payment()
        .bucket(bucket)
        .request_payment_configuration(
            RequestPaymentConfiguration::builder()
                .payer(Payer::Requester)
                .build()?
        )
        .send()
        .await
        .context("Failed to enable Requester Pays")?;
    
    Ok(())
}

/// Verifica se Requester Pays está habilitado
pub async fn is_requester_pays_enabled(client: &S3Client, bucket: &str) -> Result<bool> {
    let resp = client
        .get_bucket_request_payment()
        .bucket(bucket)
        .send()
        .await
        .context("Failed to get bucket request payment config")?;
    
    Ok(matches!(resp.payer, Some(Payer::Requester)))
}

/// Download de objeto S3 com Requester Pays
/// 
/// O caller (Sidecar) assume o custo de egress.
/// AWS cobra do dono das credenciais (AI Lab), não do dono do bucket.
pub async fn download_with_requester_pays(
    client: &S3Client,
    bucket: &str,
    key: &str,
) -> Result<Vec<u8>> {
    let resp = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .request_payer(RequestPayer::Requester)  // ← Assume custo
        .send()
        .await
        .context(format!("Failed to download {} from {}", key, bucket))?;
    
    let bytes = resp.body.collect().await?.into_bytes();
    Ok(bytes.to_vec())
}

/// Calcula custo estimado de egress
/// 
/// AWS cobra $0.09/GB para egress inter-region
/// Primeira 100 GB/mês: $0.09/GB
/// Próximos 10 TB/mês: $0.085/GB
/// Acima de 50 TB/mês: $0.07/GB
pub fn estimate_egress_cost(total_gb: f64, region: &str) -> f64 {
    // Simplificação: usar tier mais comum ($0.09/GB)
    // TODO: Implementar tiers reais baseado em volume
    let cost_per_gb = match region {
        "us-east-1" | "us-west-2" => 0.09,
        "eu-west-1" | "eu-central-1" => 0.09,
        "ap-southeast-1" => 0.12,
        _ => 0.09,
    };
    
    total_gb * cost_per_gb
}

/// Calcula breakdown de custo para um contrato
#[derive(Debug, Clone)]
pub struct CostBreakdown {
    pub data_cost: f64,
    pub egress_cost: f64,
    pub xase_fee: f64,
    pub total: f64,
}

pub fn calculate_cost_breakdown(
    hours: f64,
    price_per_hour: f64,
    avg_gb_per_hour: f64,
    region: &str,
) -> CostBreakdown {
    let data_cost = hours * price_per_hour;
    let total_gb = hours * avg_gb_per_hour;
    let egress_cost = estimate_egress_cost(total_gb, region);
    let xase_fee = (data_cost + egress_cost) * 0.20;
    let total = data_cost + egress_cost + xase_fee;
    
    CostBreakdown {
        data_cost,
        egress_cost,
        xase_fee,
        total,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_estimate_egress_cost() {
        // 100 GB @ $0.09/GB = $9.00
        let cost = estimate_egress_cost(100.0, "us-east-1");
        assert_eq!(cost, 9.0);
        
        // 1000 GB @ $0.09/GB = $90.00
        let cost = estimate_egress_cost(1000.0, "us-west-2");
        assert_eq!(cost, 90.0);
    }
    
    #[test]
    fn test_calculate_cost_breakdown() {
        // 100 hours @ $50/hour, 10 GB/hour
        let breakdown = calculate_cost_breakdown(100.0, 50.0, 10.0, "us-east-1");
        
        // Data: 100h × $50 = $5,000
        assert_eq!(breakdown.data_cost, 5000.0);
        
        // Egress: 100h × 10GB × $0.09 = $90
        assert_eq!(breakdown.egress_cost, 90.0);
        
        // Xase fee: ($5,000 + $90) × 20% = $1,018
        assert_eq!(breakdown.xase_fee, 1018.0);
        
        // Total: $5,000 + $90 + $1,018 = $6,108
        assert_eq!(breakdown.total, 6108.0);
    }
}
