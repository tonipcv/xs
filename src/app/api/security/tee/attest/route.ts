/**
 * API Route: TEE Attestation
 * POST /api/security/tee/attest - Generate attestation
 * POST /api/security/tee/verify - Verify attestation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { createTEEManager, TEEType } from '@/lib/security/tee-attestation';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, teeType, nonce, report, simulatedMode } = body;

    if (action === 'generate') {
      // Generate attestation
      const teeManager = createTEEManager({
        teeType: teeType || TEEType.SIMULATED,
        simulatedMode: simulatedMode !== false, // Default to simulated
      });

      const attestation = await teeManager.generateAttestation(nonce);

      return NextResponse.json({
        success: true,
        attestation,
        warning: attestation.simulated 
          ? 'This is a simulated attestation. Not suitable for production use.'
          : undefined,
      });
    } else if (action === 'verify') {
      // Verify attestation
      if (!report) {
        return NextResponse.json(
          { error: 'Attestation report required for verification' },
          { status: 400 }
        );
      }

      const teeManager = createTEEManager({
        teeType: report.teeType || TEEType.SIMULATED,
        simulatedMode: report.simulated,
      });

      const verification = await teeManager.verifyAttestation(report, nonce);

      return NextResponse.json({
        success: true,
        verification,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "generate" or "verify"' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('TEE attestation error:', error);
    return NextResponse.json(
      { error: error.message || 'TEE attestation failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/security/tee/attest',
    methods: ['POST'],
    description: 'TEE (Trusted Execution Environment) Attestation',
    actions: {
      generate: {
        description: 'Generate TEE attestation report',
        parameters: {
          action: 'generate',
          teeType: 'INTEL_SGX | AMD_SEV | ARM_TRUSTZONE | SIMULATED',
          nonce: 'Optional nonce for freshness',
          simulatedMode: 'boolean (default: true)',
        },
      },
      verify: {
        description: 'Verify TEE attestation report',
        parameters: {
          action: 'verify',
          report: 'AttestationReport object',
          nonce: 'Expected nonce (optional)',
        },
      },
    },
    supportedTEEs: {
      INTEL_SGX: 'Intel Software Guard Extensions',
      AMD_SEV: 'AMD Secure Encrypted Virtualization',
      ARM_TRUSTZONE: 'ARM TrustZone',
      SIMULATED: 'Simulated TEE for testing (default)',
    },
    note: 'Simulated mode is used by default for environments without TEE hardware',
  });
}
