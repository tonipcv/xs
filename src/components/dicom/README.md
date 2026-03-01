# DICOM Viewer Components

Advanced medical image viewing components for XASE platform.

## Installation

Install required dependencies:

```bash
npm install @cornerstonejs/core @cornerstonejs/tools @cornerstonejs/streaming-image-volume-loader
```

## Components

### DicomViewer

Single-slice DICOM image viewer with windowing, zoom, and measurement tools.

**Features:**
- Window/Level adjustment
- Zoom controls
- Measurement tools (length, ROI)
- Pan and navigate
- Reset view

**Usage:**
```tsx
import DicomViewer from '@/components/dicom/DicomViewer';

<DicomViewer
  dicomUrl="wadouri:https://example.com/dicom/image.dcm"
  width={512}
  height={512}
  onLoad={() => console.log('Loaded')}
  onError={(error) => console.error(error)}
/>
```

### DicomMPRViewer

Multi-Planar Reconstruction viewer for 3D DICOM volumes.

**Features:**
- Axial, Sagittal, Coronal views
- Synchronized viewports
- Preset window/level (Soft Tissue, Bone, Lung)
- 3D volume rendering

**Usage:**
```tsx
import DicomMPRViewer from '@/components/dicom/DicomMPRViewer';

<DicomMPRViewer
  volumeId="cornerstoneStreamingImageVolume:myVolume"
  seriesUrls={[
    'wadouri:https://example.com/dicom/slice1.dcm',
    'wadouri:https://example.com/dicom/slice2.dcm',
    // ... more slices
  ]}
  onLoad={() => console.log('Volume loaded')}
  onError={(error) => console.error(error)}
/>
```

## DICOM URL Formats

Cornerstone supports multiple DICOM URL schemes:

- **WADO-URI**: `wadouri:https://example.com/dicom/image.dcm`
- **WADO-RS**: `wadors:https://example.com/dicomweb/studies/1.2.3/series/4.5.6/instances/7.8.9`
- **DICOMweb**: Full DICOMweb protocol support

## Window/Level Presets

Common presets for different tissue types:

| Preset | Window | Level | Use Case |
|--------|--------|-------|----------|
| Soft Tissue | 400 | 40 | General soft tissue |
| Bone | 1500 | 300 | Skeletal imaging |
| Lung | 2000 | -500 | Chest/lung imaging |
| Brain | 80 | 40 | Brain CT |
| Liver | 150 | 30 | Abdominal imaging |

## Measurement Tools

Available measurement tools:

- **Length Tool**: Measure distances
- **Rectangle ROI**: Rectangular region of interest
- **Elliptical ROI**: Elliptical region of interest
- **Angle Tool**: Measure angles
- **Bidirectional Tool**: Measure in two directions

## Browser Compatibility

Requires modern browsers with:
- WebGL 2.0 support
- SharedArrayBuffer support (for multi-threading)
- WASM support

## Performance Tips

1. Use appropriate image compression
2. Enable progressive loading for large volumes
3. Implement viewport caching
4. Use web workers for heavy computations
5. Optimize DICOM server response times

## Security Considerations

- Always validate DICOM sources
- Implement proper authentication
- Use HTTPS for DICOM transfers
- Sanitize patient metadata
- Follow HIPAA/GDPR compliance

## Integration with XASE

These components integrate with XASE's:
- Dataset management
- Access control policies
- Audit logging
- Watermarking system
- Privacy toolkit

## License

Proprietary - XASE Platform
