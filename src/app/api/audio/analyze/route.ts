/**
 * API Route: Analyze Audio Quality
 * POST /api/audio/analyze
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { getAudioMetrics, validateAudioQuality, generateQualityReport } from '@/lib/audio/quality-metrics';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const thresholdsJson = formData.get('thresholds') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Save file temporarily
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'audio-upload-'));
    const tempFilePath = path.join(tempDir, file.name);
    
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempFilePath, buffer);

    try {
      // Analyze audio
      const metrics = await getAudioMetrics(tempFilePath);

      // Validate if thresholds provided
      let validation = { valid: true, issues: [] };
      if (thresholdsJson) {
        const thresholds = JSON.parse(thresholdsJson);
        validation = validateAudioQuality(metrics, thresholds);
      }

      // Generate report
      const report = generateQualityReport(metrics);

      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });

      return NextResponse.json({
        metrics,
        validation,
        report,
      });
    } catch (analysisError) {
      // Clean up on error
      await fs.rm(tempDir, { recursive: true, force: true });
      throw analysisError;
    }
  } catch (error: any) {
    console.error('Audio analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze audio' },
      { status: 500 }
    );
  }
}
