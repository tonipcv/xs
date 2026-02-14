/**
 * S3 Requester Pays Configuration
 * 
 * Problema: Quando Data Holder (AWS) vende para AI Lab (Azure),
 * o egress é cobrado do Data Holder, podendo comer 60% do lucro.
 * 
 * Solução: Habilitar "Requester Pays" no bucket S3.
 * O comprador (AI Lab) assume o custo de egress.
 */

import { S3Client, PutBucketRequestPaymentCommand, GetBucketRequestPaymentCommand } from '@aws-sdk/client-s3';

export interface RequesterPaysConfig {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Habilita Requester Pays em um bucket S3
 */
export async function enableRequesterPays(config: RequesterPaysConfig): Promise<void> {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const command = new PutBucketRequestPaymentCommand({
    Bucket: config.bucketName,
    RequestPaymentConfiguration: {
      Payer: 'Requester', // ← Comprador paga egress
    },
  });

  await client.send(command);
}

/**
 * Verifica se Requester Pays está habilitado
 */
export async function isRequesterPaysEnabled(config: RequesterPaysConfig): Promise<boolean> {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const command = new GetBucketRequestPaymentCommand({
    Bucket: config.bucketName,
  });

  const response = await client.send(command);
  return response.Payer === 'Requester';
}

/**
 * Calcula custo estimado de egress
 * 
 * AWS cobra $0.09/GB para egress inter-region
 * Primeira 100 GB/mês: $0.09/GB
 * Próximos 10 TB/mês: $0.085/GB
 * Acima de 50 TB/mês: $0.07/GB
 */
export function estimateEgressCost(totalGb: number, region: string): number {
  // Simplificação: usar tier mais comum ($0.09/GB)
  const costPerGb = region.startsWith('us-') ? 0.09 : 
                    region.startsWith('eu-') ? 0.09 :
                    region.startsWith('ap-') ? 0.12 : 0.09;
  
  return totalGb * costPerGb;
}

/**
 * Breakdown de custo para um contrato
 */
export interface CostBreakdown {
  dataCost: number;
  egressCost: number;
  xaseFee: number;
  total: number;
}

export function calculateCostBreakdown(
  hours: number,
  pricePerHour: number,
  avgGbPerHour: number,
  region: string
): CostBreakdown {
  const dataCost = hours * pricePerHour;
  const totalGb = hours * avgGbPerHour;
  const egressCost = estimateEgressCost(totalGb, region);
  const xaseFee = (dataCost + egressCost) * 0.20;
  const total = dataCost + egressCost + xaseFee;
  
  return {
    dataCost,
    egressCost,
    xaseFee,
    total,
  };
}
