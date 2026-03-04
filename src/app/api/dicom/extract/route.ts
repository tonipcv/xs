/**
 * API Route: DICOM 3D Volume Extraction
 * POST /api/dicom/extract
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/auth.config';
import { extractVolume, extractDicomMetadata, generateVolumePreviews, calculateVolumeStatistics } from '@/lib/dicom/volume-extractor';
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
    const files = formData.getAll('files') as File[];
    const outputFormat = (formData.get('outputFormat') as string) || 'nifti';
    const resample = formData.get('resample') === 'true';
    const targetSpacing = formData.get('targetSpacing') 
      ? JSON.parse(formData.get('targetSpacing') as string) 
      : undefined;
    const normalize = formData.get('normalize') === 'true';
    const windowLevel = formData.get('windowLevel')
      ? JSON.parse(formData.get('windowLevel') as string)
      : undefined;
    const generatePreviews = formData.get('generatePreviews') !== 'false';
    const calculateStats = formData.get('calculateStats') !== 'false';

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No DICOM files provided' },
        { status: 400 }
      );
    }

    // Create temporary directory for DICOM files
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'dicom-upload-'));
    const dicomDir = path.join(tempDir, 'dicom');
    await fs.mkdir(dicomDir, { recursive: true });

    // Save uploaded DICOM files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = path.join(dicomDir, `slice_${i.toString().padStart(4, '0')}.dcm`);
      await fs.writeFile(filePath, buffer);
    }

    try {
      // Extract metadata first
      const metadata = await extractDicomMetadata(dicomDir);

      // Extract 3D volume
      const outputPath = path.join(tempDir, 'volume');
      const volumeMetadata = await extractVolume(dicomDir, outputPath, {
        outputFormat: outputFormat as 'nifti' | 'nrrd' | 'raw',
        resample,
        targetSpacing,
        normalize,
        windowLevel,
      });

      // Determine output file path
      let volumeFilePath: string;
      if (outputFormat === 'nifti') {
        volumeFilePath = outputPath + '.nii.gz';
      } else if (outputFormat === 'nrrd') {
        volumeFilePath = outputPath + '.nrrd';
      } else {
        volumeFilePath = outputPath + '.raw';
      }

      // Read volume file
      const volumeBuffer = await fs.readFile(volumeFilePath);

      // Generate previews if requested
      let previews = null;
      if (generatePreviews && (outputFormat === 'nifti' || outputFormat === 'nrrd')) {
        const previewDir = path.join(tempDir, 'previews');
        const previewPaths = await generateVolumePreviews(volumeFilePath, previewDir);
        
        // Read preview images as base64
        const axialBuffer = await fs.readFile(previewPaths.axial);
        const sagittalBuffer = await fs.readFile(previewPaths.sagittal);
        const coronalBuffer = await fs.readFile(previewPaths.coronal);

        previews = {
          axial: `data:image/png;base64,${axialBuffer.toString('base64')}`,
          sagittal: `data:image/png;base64,${sagittalBuffer.toString('base64')}`,
          coronal: `data:image/png;base64,${coronalBuffer.toString('base64')}`,
        };
      }

      // Calculate statistics if requested
      let statistics = null;
      if (calculateStats && (outputFormat === 'nifti' || outputFormat === 'nrrd')) {
        statistics = await calculateVolumeStatistics(volumeFilePath);
      }

      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });

      // Return response with volume data
      return NextResponse.json({
        metadata: volumeMetadata,
        volume: {
          format: outputFormat,
          size: volumeBuffer.length,
          data: volumeBuffer.toString('base64'),
        },
        previews,
        statistics,
      });
    } catch (extractionError) {
      // Clean up on error
      await fs.rm(tempDir, { recursive: true, force: true });
      throw extractionError;
    }
  } catch (error: any) {
    console.error('DICOM extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract DICOM volume' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/dicom/extract',
    method: 'POST',
    description: 'Extract 3D volume from DICOM series',
    parameters: {
      files: 'DICOM files (multipart/form-data)',
      outputFormat: 'nifti | nrrd | raw (default: nifti)',
      resample: 'boolean (default: false)',
      targetSpacing: '[x, y, z] spacing in mm',
      normalize: 'boolean (default: false)',
      windowLevel: '{ width: number, center: number }',
      generatePreviews: 'boolean (default: true)',
      calculateStats: 'boolean (default: true)',
    },
    response: {
      metadata: 'Volume metadata',
      volume: 'Base64-encoded volume data',
      previews: 'Axial, sagittal, coronal preview images',
      statistics: 'Volume statistics (min, max, mean, std, median, histogram)',
    },
  });
}
