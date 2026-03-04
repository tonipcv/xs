/**
 * Unit Tests: TEE Attestation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import {
  TEEAttestationManager,
  TEEType,
  createTEEManager,
  AttestationReport,
} from '@/lib/security/tee-attestation';

describe('TEE Attestation', () => {
  describe('TEEAttestationManager - Simulated Mode', () => {
    let manager: TEEAttestationManager;

    beforeEach(() => {
      manager = new TEEAttestationManager({
        teeType: TEEType.SIMULATED,
        simulatedMode: true,
      });
    });

    it('should generate simulated attestation', async () => {
      const nonce = 'test-nonce-123';
      const attestation = await manager.generateAttestation(nonce);

      expect(attestation).toBeDefined();
      expect(attestation.teeType).toBe(TEEType.SIMULATED);
      expect(attestation.nonce).toBe(nonce);
      expect(attestation.simulated).toBe(true);
      expect(attestation.measurements).toBeDefined();
      expect(attestation.quote).toBeDefined();
      expect(attestation.signature).toBeDefined();
      expect(attestation.timestamp).toBeInstanceOf(Date);
    });

    it('should generate unique attestations', async () => {
      const attestation1 = await manager.generateAttestation();
      const attestation2 = await manager.generateAttestation();

      expect(attestation1.nonce).not.toBe(attestation2.nonce);
      expect(attestation1.measurements.measurement).not.toBe(
        attestation2.measurements.measurement
      );
    });

    it('should verify valid attestation', async () => {
      const nonce = 'verification-test';
      const attestation = await manager.generateAttestation(nonce);
      const verification = await manager.verifyAttestation(attestation, nonce);

      expect(verification.valid).toBe(true);
      expect(verification.teeType).toBe(TEEType.SIMULATED);
      expect(verification.trustLevel).toBe('LOW'); // Simulated = LOW trust
      expect(verification.warnings).toContain(
        'Attestation is simulated - not suitable for production'
      );
    });

    it('should reject attestation with wrong nonce', async () => {
      const attestation = await manager.generateAttestation('correct-nonce');
      const verification = await manager.verifyAttestation(
        attestation,
        'wrong-nonce'
      );

      expect(verification.valid).toBe(false);
      expect(verification.trustLevel).toBe('NONE');
      expect(verification.errors).toContain('Nonce mismatch');
    });

    it('should warn about stale attestation', async () => {
      const attestation = await manager.generateAttestation();
      
      // Modify timestamp to be old
      const oldAttestation: AttestationReport = {
        ...attestation,
        timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      const verification = await manager.verifyAttestation(oldAttestation);

      expect(verification.warnings).toContain('Attestation report is stale');
    });

    it('should seal and unseal data', async () => {
      const originalData = Buffer.from('sensitive data to protect');
      const additionalData = Buffer.from('metadata');

      const sealed = await manager.sealData(originalData, additionalData);
      expect(sealed).toBeInstanceOf(Buffer);
      expect(sealed.length).toBeGreaterThan(0);

      const unsealed = await manager.unsealData(sealed);
      expect(unsealed.data.toString()).toBe(originalData.toString());
      expect(unsealed.additionalData?.toString()).toBe(additionalData.toString());
    });

    it('should fail to unseal tampered data', async () => {
      const originalData = Buffer.from('sensitive data');
      const sealed = await manager.sealData(originalData);

      // Tamper with sealed data
      const tampered = Buffer.from(sealed);
      tampered[10] ^= 0xFF; // Flip bits

      await expect(manager.unsealData(tampered)).rejects.toThrow();
    });
  });

  describe('TEEAttestationManager - Intel SGX', () => {
    let manager: TEEAttestationManager;

    beforeEach(() => {
      manager = new TEEAttestationManager({
        teeType: TEEType.INTEL_SGX,
        simulatedMode: true, // Simulated since no real hardware
        sgxConfig: {
          spid: 'test-spid-12345678',
        },
      });
    });

    it('should generate SGX attestation', async () => {
      const attestation = await manager.generateAttestation();

      expect(attestation.teeType).toBe(TEEType.INTEL_SGX);
      expect(attestation.measurements.mrenclave).toBeDefined();
      expect(attestation.measurements.mrsigner).toBeDefined();
      expect(attestation.measurements.svn).toBeDefined();
      expect(attestation.platformInfo).toBeDefined();
      expect(attestation.platformInfo?.cpuSvn).toBeDefined();
      expect(attestation.platformInfo?.pceSvn).toBeDefined();
      expect(attestation.platformInfo?.qeSvn).toBeDefined();
    });

    it('should verify SGX measurements', async () => {
      const attestation = await manager.generateAttestation();
      const verification = await manager.verifyAttestation(attestation);

      expect(verification.valid).toBe(true);
      expect(verification.measurements.mrenclave).toBe(
        attestation.measurements.mrenclave
      );
      expect(verification.measurements.mrsigner).toBe(
        attestation.measurements.mrsigner
      );
    });
  });

  describe('TEEAttestationManager - AMD SEV', () => {
    let manager: TEEAttestationManager;

    beforeEach(() => {
      manager = new TEEAttestationManager({
        teeType: TEEType.AMD_SEV,
        simulatedMode: true,
        sevConfig: {
          chipId: 'test-chip-id',
          policy: 0x01,
        },
      });
    });

    it('should generate SEV attestation', async () => {
      const attestation = await manager.generateAttestation();

      expect(attestation.teeType).toBe(TEEType.AMD_SEV);
      expect(attestation.measurements.measurement).toBeDefined();
      expect(attestation.measurements.measurement?.length).toBe(96); // 48 bytes hex
    });

    it('should verify SEV attestation', async () => {
      const attestation = await manager.generateAttestation();
      const verification = await manager.verifyAttestation(attestation);

      expect(verification.valid).toBe(true);
      expect(verification.teeType).toBe(TEEType.AMD_SEV);
    });
  });

  describe('TEEAttestationManager - ARM TrustZone', () => {
    let manager: TEEAttestationManager;

    beforeEach(() => {
      manager = new TEEAttestationManager({
        teeType: TEEType.ARM_TRUSTZONE,
        simulatedMode: true,
        trustZoneConfig: {
          deviceId: 'test-device-123',
        },
      });
    });

    it('should generate TrustZone attestation', async () => {
      const attestation = await manager.generateAttestation();

      expect(attestation.teeType).toBe(TEEType.ARM_TRUSTZONE);
      expect(attestation.measurements.measurement).toBeDefined();
      expect(attestation.measurements.measurement?.length).toBe(64); // 32 bytes hex
    });

    it('should verify TrustZone attestation', async () => {
      const attestation = await manager.generateAttestation();
      const verification = await manager.verifyAttestation(attestation);

      expect(verification.valid).toBe(true);
      expect(verification.teeType).toBe(TEEType.ARM_TRUSTZONE);
    });
  });

  describe('createTEEManager', () => {
    it('should create manager with default simulated mode', () => {
      const manager = createTEEManager();
      expect(manager).toBeInstanceOf(TEEAttestationManager);
    });

    it('should create manager with specified TEE type', () => {
      const manager = createTEEManager({
        teeType: TEEType.INTEL_SGX,
        simulatedMode: true,
      });
      expect(manager).toBeInstanceOf(TEEAttestationManager);
    });

    it('should auto-detect TEE from environment', () => {
      // Set environment variable
      process.env.SGX_HARDWARE_AVAILABLE = 'true';
      
      const manager = createTEEManager();
      expect(manager).toBeInstanceOf(TEEAttestationManager);
      
      // Clean up
      delete process.env.SGX_HARDWARE_AVAILABLE;
    });
  });

  describe('Data Sealing', () => {
    it('should seal large data', async () => {
      const manager = createTEEManager();
      const largeData = crypto.randomBytes(1024 * 1024); // 1MB

      const sealed = await manager.sealData(largeData);
      const unsealed = await manager.unsealData(sealed);

      expect(unsealed.data.length).toBe(largeData.length);
      expect(unsealed.data.equals(largeData)).toBe(true);
    });

    it('should seal data without additional data', async () => {
      const manager = createTEEManager();
      const data = Buffer.from('test data');

      const sealed = await manager.sealData(data);
      const unsealed = await manager.unsealData(sealed);

      expect(unsealed.data.toString()).toBe(data.toString());
      expect(unsealed.additionalData).toBeUndefined();
    });

    it('should handle empty data', async () => {
      const manager = createTEEManager();
      const emptyData = Buffer.alloc(0);

      const sealed = await manager.sealData(emptyData);
      const unsealed = await manager.unsealData(sealed);

      expect(unsealed.data.length).toBe(0);
    });
  });

  describe('Trust Levels', () => {
    it('should assign HIGH trust to valid non-simulated attestation', async () => {
      const manager = new TEEAttestationManager({
        teeType: TEEType.INTEL_SGX,
        simulatedMode: false, // Pretend we have real hardware
      });

      // Mock the detection to return false
      (manager as any).simulatedMode = false;

      const attestation = await manager.generateAttestation();
      attestation.simulated = false; // Override for test

      const verification = await manager.verifyAttestation(attestation);

      expect(verification.trustLevel).toBe('HIGH');
    });

    it('should assign LOW trust to simulated attestation', async () => {
      const manager = createTEEManager();
      const attestation = await manager.generateAttestation();
      const verification = await manager.verifyAttestation(attestation);

      expect(verification.trustLevel).toBe('LOW');
    });

    it('should assign NONE trust to invalid attestation', async () => {
      const manager = createTEEManager();
      const attestation = await manager.generateAttestation('nonce1');
      const verification = await manager.verifyAttestation(attestation, 'nonce2');

      expect(verification.trustLevel).toBe('NONE');
    });
  });
});
