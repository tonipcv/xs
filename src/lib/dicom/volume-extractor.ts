/**
 * DICOM 3D Volume Extractor
 * Extract and process 3D volumes from DICOM series
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VolumeMetadata {
  seriesInstanceUID: string;
  studyInstanceUID: string;
  patientID: string;
  patientName: string;
  modality: string;
  sliceCount: number;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  spacing: {
    x: number;
    y: number;
    z: number;
  };
  orientation: string;
  pixelData?: ArrayBuffer;
}

export interface VolumeExtractionOptions {
  outputFormat?: 'nifti' | 'nrrd' | 'raw';
  resample?: boolean;
  targetSpacing?: [number, number, number];
  normalize?: boolean;
  windowLevel?: { width: number; center: number };
}

/**
 * Extract metadata from DICOM series using dcmtk
 */
export async function extractDicomMetadata(dicomDir: string): Promise<VolumeMetadata> {
  try {
    // Use dcmdump to extract metadata from first file
    const files = await fs.readdir(dicomDir);
    const firstDicom = path.join(dicomDir, files[0]);

    const { stdout } = await execAsync(`dcmdump "${firstDicom}"`);

    // Parse DICOM tags
    const seriesUID = extractTag(stdout, '0020,000e');
    const studyUID = extractTag(stdout, '0020,000d');
    const patientID = extractTag(stdout, '0010,0020');
    const patientName = extractTag(stdout, '0010,0010');
    const modality = extractTag(stdout, '0008,0060');
    const rows = parseInt(extractTag(stdout, '0028,0010'));
    const cols = parseInt(extractTag(stdout, '0028,0011'));
    const pixelSpacing = extractTag(stdout, '0028,0030').split('\\').map(Number);
    const sliceThickness = parseFloat(extractTag(stdout, '0018,0050'));

    return {
      seriesInstanceUID: seriesUID,
      studyInstanceUID: studyUID,
      patientID,
      patientName,
      modality,
      sliceCount: files.length,
      dimensions: {
        width: cols,
        height: rows,
        depth: files.length,
      },
      spacing: {
        x: pixelSpacing[0] || 1,
        y: pixelSpacing[1] || 1,
        z: sliceThickness || 1,
      },
      orientation: 'AXIAL',
    };
  } catch (error) {
    console.error('Failed to extract DICOM metadata:', error);
    throw new Error(`Metadata extraction failed: ${error}`);
  }
}

function extractTag(dicomDump: string, tag: string): string {
  const regex = new RegExp(`\\(${tag}\\).*?\\[(.+?)\\]`);
  const match = dicomDump.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Convert DICOM series to 3D volume using Python/SimpleITK
 */
export async function extractVolume(
  dicomDir: string,
  outputPath: string,
  options: VolumeExtractionOptions = {}
): Promise<VolumeMetadata> {
  const pythonScript = `
import sys
import os
import json
import SimpleITK as sitk
import numpy as np

def extract_volume(dicom_dir, output_path, options):
    # Read DICOM series
    reader = sitk.ImageSeriesReader()
    dicom_names = reader.GetGDCMSeriesFileNames(dicom_dir)
    reader.SetFileNames(dicom_names)
    image = reader.Execute()
    
    # Get metadata
    metadata = {
        'seriesInstanceUID': image.GetMetaData('0020|000e'),
        'studyInstanceUID': image.GetMetaData('0020|000d'),
        'patientID': image.GetMetaData('0010|0020'),
        'patientName': image.GetMetaData('0010|0010'),
        'modality': image.GetMetaData('0008|0060'),
        'sliceCount': len(dicom_names),
        'dimensions': {
            'width': image.GetWidth(),
            'height': image.GetHeight(),
            'depth': image.GetDepth()
        },
        'spacing': {
            'x': float(image.GetSpacing()[0]),
            'y': float(image.GetSpacing()[1]),
            'z': float(image.GetSpacing()[2])
        },
        'orientation': 'AXIAL'
    }
    
    # Resample if requested
    if options.get('resample') and options.get('targetSpacing'):
        target_spacing = options['targetSpacing']
        original_size = image.GetSize()
        original_spacing = image.GetSpacing()
        
        new_size = [
            int(round(original_size[0] * (original_spacing[0] / target_spacing[0]))),
            int(round(original_size[1] * (original_spacing[1] / target_spacing[1]))),
            int(round(original_size[2] * (original_spacing[2] / target_spacing[2])))
        ]
        
        resample = sitk.ResampleImageFilter()
        resample.SetOutputSpacing(target_spacing)
        resample.SetSize(new_size)
        resample.SetOutputDirection(image.GetDirection())
        resample.SetOutputOrigin(image.GetOrigin())
        resample.SetTransform(sitk.Transform())
        resample.SetDefaultPixelValue(image.GetPixelIDValue())
        resample.SetInterpolator(sitk.sitkLinear)
        
        image = resample.Execute(image)
        
        metadata['dimensions'] = {
            'width': new_size[0],
            'height': new_size[1],
            'depth': new_size[2]
        }
        metadata['spacing'] = {
            'x': target_spacing[0],
            'y': target_spacing[1],
            'z': target_spacing[2]
        }
    
    # Apply windowing if requested
    if options.get('windowLevel'):
        wl = options['windowLevel']
        window_min = wl['center'] - wl['width'] / 2
        window_max = wl['center'] + wl['width'] / 2
        
        image = sitk.IntensityWindowing(
            image,
            windowMinimum=window_min,
            windowMaximum=window_max,
            outputMinimum=0.0,
            outputMaximum=255.0
        )
        image = sitk.Cast(image, sitk.sitkUInt8)
    
    # Normalize if requested
    if options.get('normalize'):
        image = sitk.Normalize(image)
        image = sitk.Cast(sitk.RescaleIntensity(image, 0, 255), sitk.sitkUInt8)
    
    # Write output
    output_format = options.get('outputFormat', 'nifti')
    
    if output_format == 'nifti':
        sitk.WriteImage(image, output_path + '.nii.gz')
    elif output_format == 'nrrd':
        sitk.WriteImage(image, output_path + '.nrrd')
    elif output_format == 'raw':
        # Write raw binary + metadata
        array = sitk.GetArrayFromImage(image)
        array.tofile(output_path + '.raw')
        
        with open(output_path + '.json', 'w') as f:
            json.dump(metadata, f, indent=2)
    
    return metadata

if __name__ == '__main__':
    dicom_dir = sys.argv[1]
    output_path = sys.argv[2]
    options = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    
    metadata = extract_volume(dicom_dir, output_path, options)
    print(json.dumps(metadata))
`;

  try {
    // Write Python script
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'volume-extract-'));
    const scriptPath = path.join(tempDir, 'extract.py');
    await fs.writeFile(scriptPath, pythonScript);

    // Execute
    const optionsJson = JSON.stringify(options);
    const { stdout } = await execAsync(
      `python3 "${scriptPath}" "${dicomDir}" "${outputPath}" '${optionsJson}'`
    );

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });

    return JSON.parse(stdout);
  } catch (error) {
    console.error('Volume extraction failed:', error);
    throw new Error(`Failed to extract 3D volume: ${error}`);
  }
}

/**
 * Generate volume preview images (axial, sagittal, coronal)
 */
export async function generateVolumePreviews(
  volumePath: string,
  outputDir: string
): Promise<{ axial: string; sagittal: string; coronal: string }> {
  const pythonScript = `
import sys
import os
import SimpleITK as sitk
import numpy as np
from PIL import Image

def generate_previews(volume_path, output_dir):
    # Read volume
    if volume_path.endswith('.nii.gz') or volume_path.endswith('.nii'):
        image = sitk.ReadImage(volume_path)
    elif volume_path.endswith('.nrrd'):
        image = sitk.ReadImage(volume_path)
    else:
        raise ValueError('Unsupported format')
    
    array = sitk.GetArrayFromImage(image)
    
    # Normalize to 0-255
    array = ((array - array.min()) / (array.max() - array.min()) * 255).astype(np.uint8)
    
    # Get middle slices
    depth, height, width = array.shape
    
    # Axial (z-axis)
    axial_slice = array[depth // 2, :, :]
    axial_img = Image.fromarray(axial_slice)
    axial_path = os.path.join(output_dir, 'axial.png')
    axial_img.save(axial_path)
    
    # Sagittal (x-axis)
    sagittal_slice = array[:, :, width // 2]
    sagittal_img = Image.fromarray(sagittal_slice)
    sagittal_path = os.path.join(output_dir, 'sagittal.png')
    sagittal_img.save(sagittal_path)
    
    # Coronal (y-axis)
    coronal_slice = array[:, height // 2, :]
    coronal_img = Image.fromarray(coronal_slice)
    coronal_path = os.path.join(output_dir, 'coronal.png')
    coronal_img.save(coronal_path)
    
    return {
        'axial': axial_path,
        'sagittal': sagittal_path,
        'coronal': coronal_path
    }

if __name__ == '__main__':
    volume_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    os.makedirs(output_dir, exist_ok=True)
    
    result = generate_previews(volume_path, output_dir)
    print(result['axial'])
    print(result['sagittal'])
    print(result['coronal'])
`;

  try {
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'preview-gen-'));
    const scriptPath = path.join(tempDir, 'preview.py');
    await fs.writeFile(scriptPath, pythonScript);

    await fs.mkdir(outputDir, { recursive: true });

    const { stdout } = await execAsync(
      `python3 "${scriptPath}" "${volumePath}" "${outputDir}"`
    );

    await fs.rm(tempDir, { recursive: true, force: true });

    const lines = stdout.trim().split('\n');
    return {
      axial: lines[0],
      sagittal: lines[1],
      coronal: lines[2],
    };
  } catch (error) {
    console.error('Preview generation failed:', error);
    throw new Error(`Failed to generate previews: ${error}`);
  }
}

/**
 * Calculate volume statistics
 */
export async function calculateVolumeStatistics(volumePath: string): Promise<{
  min: number;
  max: number;
  mean: number;
  std: number;
  median: number;
  histogram: number[];
}> {
  const pythonScript = `
import sys
import SimpleITK as sitk
import numpy as np
import json

def calculate_stats(volume_path):
    image = sitk.ReadImage(volume_path)
    array = sitk.GetArrayFromImage(image)
    
    stats = {
        'min': float(np.min(array)),
        'max': float(np.max(array)),
        'mean': float(np.mean(array)),
        'std': float(np.std(array)),
        'median': float(np.median(array)),
        'histogram': np.histogram(array, bins=256)[0].tolist()
    }
    
    return stats

if __name__ == '__main__':
    volume_path = sys.argv[1]
    stats = calculate_stats(volume_path)
    print(json.dumps(stats))
`;

  try {
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'vol-stats-'));
    const scriptPath = path.join(tempDir, 'stats.py');
    await fs.writeFile(scriptPath, pythonScript);

    const { stdout } = await execAsync(`python3 "${scriptPath}" "${volumePath}"`);

    await fs.rm(tempDir, { recursive: true, force: true });

    return JSON.parse(stdout);
  } catch (error) {
    console.error('Statistics calculation failed:', error);
    throw new Error(`Failed to calculate statistics: ${error}`);
  }
}

/**
 * Segment volume using thresholding
 */
export async function segmentVolume(
  volumePath: string,
  outputPath: string,
  lowerThreshold: number,
  upperThreshold: number
): Promise<void> {
  const pythonScript = `
import sys
import SimpleITK as sitk

def segment_volume(volume_path, output_path, lower, upper):
    image = sitk.ReadImage(volume_path)
    
    # Binary threshold
    segmented = sitk.BinaryThreshold(
        image,
        lowerThreshold=lower,
        upperThreshold=upper,
        insideValue=1,
        outsideValue=0
    )
    
    # Optional: morphological operations to clean up
    segmented = sitk.BinaryMorphologicalClosing(segmented, [3, 3, 3])
    segmented = sitk.BinaryMorphologicalOpening(segmented, [2, 2, 2])
    
    sitk.WriteImage(segmented, output_path)

if __name__ == '__main__':
    volume_path = sys.argv[1]
    output_path = sys.argv[2]
    lower = float(sys.argv[3])
    upper = float(sys.argv[4])
    
    segment_volume(volume_path, output_path, lower, upper)
`;

  try {
    const tempDir = await fs.mkdtemp(path.join('/tmp', 'vol-segment-'));
    const scriptPath = path.join(tempDir, 'segment.py');
    await fs.writeFile(scriptPath, pythonScript);

    await execAsync(
      `python3 "${scriptPath}" "${volumePath}" "${outputPath}" ${lowerThreshold} ${upperThreshold}`
    );

    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Segmentation failed:', error);
    throw new Error(`Failed to segment volume: ${error}`);
  }
}
