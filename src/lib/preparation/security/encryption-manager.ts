/**
 * Encryption Manager for Data Security
 * Handles at-rest (S3 SSE-KMS) and in-transit (TLS) encryption
 */

export interface EncryptionConfig {
  atRestAlgorithm: 'AES256' | 'aws:kms';
  kmsKeyId?: string;
  inTransitTLS: boolean;
  tlsVersion: '1.2' | '1.3';
}

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyId: string;
  algorithm: string;
}

export interface S3EncryptionConfig {
  serverSideEncryption: 'AES256' | 'aws:kms';
  kmsKeyId?: string;
  bucketKeyEnabled?: boolean;
}

export class EncryptionManager {
  private config: EncryptionConfig;

  constructor(config: Partial<EncryptionConfig>) {
    this.config = {
      atRestAlgorithm: 'aws:kms',
      inTransitTLS: true,
      tlsVersion: '1.3',
      ...config,
    };
  }

  /**
   * Configure S3 SSE-KMS encryption for at-rest storage
   */
  getS3EncryptionConfig(): S3EncryptionConfig {
    return {
      serverSideEncryption: this.config.atRestAlgorithm as 'AES256' | 'aws:kms',
      kmsKeyId: this.config.kmsKeyId,
      bucketKeyEnabled: this.config.atRestAlgorithm === 'aws:kms',
    };
  }

  /**
   * Generate TLS configuration for in-transit encryption
   */
  getTLSConfig(): {
    minVersion: string;
    maxVersion: string;
    cipherSuites: string[];
    hsts: boolean;
  } {
    return {
      minVersion: this.config.tlsVersion === '1.3' ? 'TLSv1.3' : 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      cipherSuites: this.config.tlsVersion === '1.3'
        ? ['TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256']
        : ['ECDHE-RSA-AES256-GCM-SHA384', 'ECDHE-RSA-AES128-GCM-SHA256'],
      hsts: true,
    };
  }

  /**
   * Encrypt data client-side before upload
   * For highly sensitive data requiring client-side encryption
   */
  async encryptData(
    plaintext: Buffer,
    keyId: string
  ): Promise<EncryptedData> {
    // In production, use AWS KMS or similar
    // For now, simulate encryption
    const iv = this.generateIV();
    const tag = this.generateTag();
    
    // Simulate AES-256-GCM encryption
    const ciphertext = this.simulateEncryption(plaintext, iv);

    return {
      ciphertext,
      iv,
      tag,
      keyId,
      algorithm: 'AES-256-GCM',
    };
  }

  /**
   * Decrypt client-side encrypted data
   */
  async decryptData(encryptedData: EncryptedData): Promise<Buffer> {
    // In production, use AWS KMS or similar
    // For now, simulate decryption
    return this.simulateDecryption(encryptedData.ciphertext, encryptedData.iv);
  }

  /**
   * Verify TLS is properly configured
   */
  verifyTLSConfig(config: unknown): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!config || typeof config !== 'object') {
      issues.push('Invalid TLS configuration');
      return { valid: false, issues };
    }

    const tls = config as Record<string, unknown>;

    if (!tls.inTransitTLS) {
      issues.push('TLS is not enabled for in-transit encryption');
    }

    if (tls.tlsVersion === '1.0' || tls.tlsVersion === '1.1') {
      issues.push('TLS version 1.0/1.1 is not secure, use 1.2 or 1.3');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Verify at-rest encryption configuration
   */
  verifyAtRestConfig(config: unknown): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!config || typeof config !== 'object') {
      issues.push('Invalid at-rest encryption configuration');
      return { valid: false, issues };
    }

    const atRest = config as Record<string, unknown>;

    if (!atRest.atRestAlgorithm) {
      issues.push('At-rest encryption algorithm not specified');
    }

    if (atRest.atRestAlgorithm === 'aws:kms' && !atRest.kmsKeyId) {
      issues.push('KMS Key ID required when using aws:kms encryption');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate encryption report
   */
  generateReport(): {
    atRest: {
      enabled: boolean;
      algorithm: string;
      kmsKeyId?: string;
    };
    inTransit: {
      enabled: boolean;
      tlsVersion: string;
      hsts: boolean;
    };
    compliance: string[];
  } {
    const compliance: string[] = [];

    if (this.config.atRestAlgorithm === 'aws:kms') {
      compliance.push('SOC 2');
      compliance.push('HIPAA');
    }

    if (this.config.inTransitTLS && this.config.tlsVersion === '1.3') {
      compliance.push('PCI DSS');
    }

    return {
      atRest: {
        enabled: true,
        algorithm: this.config.atRestAlgorithm,
        kmsKeyId: this.config.kmsKeyId,
      },
      inTransit: {
        enabled: this.config.inTransitTLS,
        tlsVersion: this.config.tlsVersion,
        hsts: true,
      },
      compliance,
    };
  }

  /**
   * Rotate encryption key (for KMS customer-managed keys)
   */
  async rotateKey(
    oldKeyId: string,
    newKeyId: string,
    dataToReencrypt: Buffer
  ): Promise<{ newCiphertext: Buffer; rotationSuccessful: boolean }> {
    try {
      // Decrypt with old key
      const plaintext = await this.decryptData({
        ciphertext: dataToReencrypt,
        iv: Buffer.alloc(12),
        tag: Buffer.alloc(16),
        keyId: oldKeyId,
        algorithm: 'AES-256-GCM',
      });

      // Re-encrypt with new key
      const newEncrypted = await this.encryptData(plaintext, newKeyId);

      return {
        newCiphertext: newEncrypted.ciphertext,
        rotationSuccessful: true,
      };
    } catch (error) {
      return {
        newCiphertext: dataToReencrypt,
        rotationSuccessful: false,
      };
    }
  }

  private generateIV(): Buffer {
    return Buffer.from(Array.from({ length: 12 }, () => Math.floor(Math.random() * 256)));
  }

  private generateTag(): Buffer {
    return Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
  }

  private simulateEncryption(plaintext: Buffer, iv: Buffer): Buffer {
    // Simulate encryption by XOR with IV (NOT REAL ENCRYPTION)
    return Buffer.from(plaintext.map((b, i) => b ^ iv[i % iv.length]));
  }

  private simulateDecryption(ciphertext: Buffer, iv: Buffer): Buffer {
    // Simulate decryption (XOR is symmetric)
    return this.simulateEncryption(ciphertext, iv);
  }
}
