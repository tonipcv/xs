/**
 * S3 Configuration Helper for Data Preparation Pipeline
 * Ensures all required environment variables are set for S3 mode
 */

export interface S3Config {
  mode: 's3' | 'stub';
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string; // For MinIO/local S3
  forcePathStyle?: boolean; // For MinIO
}

export function getS3Config(): S3Config {
  const mode = (process.env.PREPARATION_SIGNED_URL_MODE as 's3' | 'stub') || 
               (process.env.S3_BUCKET ? 's3' : 'stub');
  
  return {
    mode,
    bucket: process.env.S3_BUCKET || 'xase-datasets',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

export function validateS3Config(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!process.env.AWS_ACCESS_KEY_ID) {
    missing.push('AWS_ACCESS_KEY_ID');
  }
  
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    missing.push('AWS_SECRET_ACCESS_KEY');
  }
  
  if (!process.env.S3_BUCKET) {
    missing.push('S3_BUCKET');
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

export function ensureS3Mode(): void {
  const { valid, missing } = validateS3Config();
  
  if (!valid) {
    console.warn(`[S3 Config] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[S3 Config] Falling back to stub mode');
    process.env.PREPARATION_SIGNED_URL_MODE = 'stub';
  } else {
    console.log('[S3 Config] S3 mode configured successfully');
    process.env.PREPARATION_SIGNED_URL_MODE = 's3';
  }
}

export function getRequiredEnvVars(): string[] {
  return [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'S3_BUCKET',
  ];
}

export function printS3Config(): void {
  const config = getS3Config();
  console.log('[S3 Config]');
  console.log(`  Mode: ${config.mode}`);
  console.log(`  Bucket: ${config.bucket}`);
  console.log(`  Region: ${config.region}`);
  console.log(`  Endpoint: ${config.endpoint || 'default (AWS)'}`);
  console.log(`  Access Key: ${config.accessKeyId ? '***' + config.accessKeyId.slice(-4) : 'not set'}`);
}
