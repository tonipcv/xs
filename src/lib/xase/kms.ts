/**
 * XASE CORE - KMS Signing
 * 
 * Assinatura criptográfica com KMS (AWS KMS, GCP KMS, Azure Key Vault)
 * Inclui mock local para desenvolvimento
 */

import crypto from 'crypto';

export interface KMSSignature {
  signature: string;        // Base64 da assinatura
  algorithm: string;        // Ex: "RSA-SHA256", "ECDSA-SHA256"
  keyId: string;           // ID da chave no KMS
  timestamp: Date;
}

export interface KMSProvider {
  sign(data: string): Promise<KMSSignature>;
  verify(data: string, signature: string): Promise<boolean>;
  getKeyId(): string;
}

/**
 * Mock KMS Provider (para desenvolvimento)
 * Usa chave RSA local persistente
 */
export class MockKMSProvider implements KMSProvider {
  private privateKey: crypto.KeyObject;
  public publicKey: crypto.KeyObject;
  private keyId: string;

  constructor() {
    // Usar chave fixa do env ou gerar nova (mas avisar)
    const envPrivateKey = process.env.XASE_MOCK_PRIVATE_KEY_PEM
    const envPublicKey = process.env.XASE_MOCK_PUBLIC_KEY_PEM

    if (envPrivateKey && envPublicKey) {
      this.privateKey = crypto.createPrivateKey(envPrivateKey)
      this.publicKey = crypto.createPublicKey(envPublicKey)
      this.keyId = 'mock-key-persistent'
      console.log('[MockKMS] Using persistent key from env')
    } else {
      // Gerar par de chaves RSA 2048 bits
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      this.privateKey = crypto.createPrivateKey(privateKey);
      this.publicKey = crypto.createPublicKey(publicKey);
      this.keyId = 'mock-key-' + crypto.randomBytes(8).toString('hex');

      console.warn('[MockKMS] ⚠️  Generated NEW ephemeral key:', this.keyId)
      console.warn('[MockKMS] ⚠️  Set XASE_MOCK_PRIVATE_KEY_PEM and XASE_MOCK_PUBLIC_KEY_PEM to persist across restarts')
    }
  }

  getPublicKeyPem(): string {
    return this.publicKey.export({ type: 'spki', format: 'pem' }) as string
  }

  async sign(data: string): Promise<KMSSignature> {
    const sign = crypto.createSign('RSA-SHA256');
    // Detect SHA-256 hex (64 chars) and treat as binary digest
    const payload = /^[a-f0-9]{64}$/i.test(data)
      ? Buffer.from(data, 'hex')
      : Buffer.from(data)
    sign.update(payload);
    sign.end();

    const signature = sign.sign(this.privateKey, 'base64');

    return {
      signature,
      algorithm: 'RSA-SHA256',
      keyId: this.keyId,
      timestamp: new Date(),
    };
  }

  async verify(data: string, signature: string): Promise<boolean> {
    try {
      const verify = crypto.createVerify('RSA-SHA256');
      const payload = /^[a-f0-9]{64}$/i.test(data)
        ? Buffer.from(data, 'hex')
        : Buffer.from(data)
      verify.update(payload);
      verify.end();

      return verify.verify(this.publicKey, signature, 'base64');
    } catch (error) {
      console.error('[MockKMS] Verification error:', error);
      return false;
    }
  }

  getKeyId(): string {
    return this.keyId;
  }
}

/**
 * AWS KMS Provider
 * Requer: AWS SDK v3 (@aws-sdk/client-kms)
 */
export class AWSKMSProvider implements KMSProvider {
  private keyId: string;
  private kmsClient: any; // KMSClient from @aws-sdk/client-kms

  constructor(keyId: string, region: string = 'us-east-1') {
    this.keyId = keyId;

    // Lazy load AWS SDK (opcional)
    try {
      const { KMSClient } = require('@aws-sdk/client-kms');
      this.kmsClient = new KMSClient({ region });
      console.log('[AWSKMS] Initialized with key:', keyId);
    } catch (error) {
      throw new Error(
        'AWS KMS requires @aws-sdk/client-kms. Install with: npm i @aws-sdk/client-kms'
      );
    }
  }

  async sign(data: string): Promise<KMSSignature> {
    const { SignCommand } = require('@aws-sdk/client-kms');

    // Se data é hash hex (64 chars), converter para buffer
    const message = /^[a-f0-9]{64}$/i.test(data)
      ? Buffer.from(data, 'hex')
      : Buffer.from(data)

    const command = new SignCommand({
      KeyId: this.keyId,
      Message: message,
      MessageType: 'DIGEST', // Assina hash diretamente (não aplica SHA-256 novamente)
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    });

    const response = await this.kmsClient.send(command);

    return {
      signature: Buffer.from(response.Signature).toString('base64'),
      algorithm: 'RSA-SHA256',
      keyId: this.keyId,
      timestamp: new Date(),
    };
  }

  async verify(data: string, signature: string): Promise<boolean> {
    const { VerifyCommand } = require('@aws-sdk/client-kms');

    const command = new VerifyCommand({
      KeyId: this.keyId,
      Message: Buffer.from(data),
      MessageType: 'RAW',
      Signature: Buffer.from(signature, 'base64'),
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    });

    try {
      const response = await this.kmsClient.send(command);
      return response.SignatureValid === true;
    } catch (error) {
      console.error('[AWSKMS] Verification error:', error);
      return false;
    }
  }

  getKeyId(): string {
    return this.keyId;
  }
}

/**
 * Factory: cria provider baseado em env vars
 */
export function createKMSProvider(): KMSProvider {
  const kmsType = process.env.XASE_KMS_TYPE || 'mock';

  switch (kmsType.toLowerCase()) {
    case 'aws':
      const keyId = process.env.XASE_KMS_KEY_ID;
      const region = process.env.XASE_KMS_REGION || 'us-east-1';

      if (!keyId) {
        throw new Error('XASE_KMS_KEY_ID is required for AWS KMS');
      }

      return new AWSKMSProvider(keyId, region);

    case 'mock':
    default:
      return new MockKMSProvider();
  }
}

// Singleton instance
let kmsInstance: KMSProvider | null = null;

export function getKMSProvider(): KMSProvider {
  if (!kmsInstance) {
    kmsInstance = createKMSProvider();
  }
  return kmsInstance;
}
