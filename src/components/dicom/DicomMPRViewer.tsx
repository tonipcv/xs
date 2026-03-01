'use client';

/**
 * DICOM MPR Viewer Component
 * Multi-Planar Reconstruction viewer for 3D DICOM volumes
 */

import React, { useEffect, useRef, useState } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import { RenderingEngine, Enums, volumeLoader } from '@cornerstonejs/core';

interface DicomMPRViewerProps {
  volumeId: string;
  seriesUrls: string[];
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export default function DicomMPRViewer({
  volumeId,
  seriesUrls,
  onLoad,
  onError,
}: DicomMPRViewerProps) {
  const axialRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [renderingEngine, setRenderingEngine] = useState<RenderingEngine | null>(null);

  useEffect(() => {
    initializeMPR();
  }, []);

  useEffect(() => {
    if (axialRef.current && sagittalRef.current && coronalRef.current && seriesUrls.length > 0) {
      loadVolume();
    }
  }, [seriesUrls]);

  const initializeMPR = async () => {
    try {
      await cornerstone.init();
      
      const engine = new RenderingEngine('mprViewerEngine');
      setRenderingEngine(engine);
    } catch (error) {
      console.error('Failed to initialize MPR viewer:', error);
      onError?.(error as Error);
    }
  };

  const loadVolume = async () => {
    if (!axialRef.current || !sagittalRef.current || !coronalRef.current || !renderingEngine) {
      return;
    }

    try {
      // Load volume
      const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds: seriesUrls,
      });

      await volume.load();

      // Create viewports
      const viewportInputArray = [
        {
          viewportId: 'AXIAL',
          element: axialRef.current,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: 'SAGITTAL',
          element: sagittalRef.current,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: 'CORONAL',
          element: coronalRef.current,
          type: Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: {
            orientation: Enums.OrientationAxis.CORONAL,
          },
        },
      ];

      renderingEngine.setViewports(viewportInputArray);

      // Set volumes for each viewport
      await Promise.all([
        renderingEngine.getViewport('AXIAL').setVolumes([{ volumeId }]),
        renderingEngine.getViewport('SAGITTAL').setVolumes([{ volumeId }]),
        renderingEngine.getViewport('CORONAL').setVolumes([{ volumeId }]),
      ]);

      // Render all viewports
      renderingEngine.render();

      setIsLoaded(true);
      onLoad?.();
    } catch (error) {
      console.error('Failed to load DICOM volume:', error);
      onError?.(error as Error);
    }
  };

  const syncViewports = () => {
    if (!renderingEngine) return;

    const axialViewport = renderingEngine.getViewport('AXIAL');
    const sagittalViewport = renderingEngine.getViewport('SAGITTAL');
    const coronalViewport = renderingEngine.getViewport('CORONAL');

    // Sync camera positions
    const axialCamera = axialViewport.getCamera();
    sagittalViewport.setCamera(axialCamera);
    coronalViewport.setCamera(axialCamera);

    renderingEngine.render();
  };

  const adjustWindowLevel = (width: number, center: number) => {
    if (!renderingEngine) return;

    const viewports = ['AXIAL', 'SAGITTAL', 'CORONAL'];
    
    viewports.forEach(viewportId => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.setProperties({
        voiRange: {
          lower: center - width / 2,
          upper: center + width / 2,
        },
      });
    });

    renderingEngine.render();
  };

  const resetAllViews = () => {
    if (!renderingEngine) return;

    const viewports = ['AXIAL', 'SAGITTAL', 'CORONAL'];
    
    viewports.forEach(viewportId => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.resetCamera();
      viewport.resetProperties();
    });

    renderingEngine.render();
  };

  return (
    <div className="dicom-mpr-viewer">
      <div className="mpr-controls bg-gray-100 p-4 rounded-t-lg">
        <div className="flex gap-4 items-center">
          <button
            onClick={syncViewports}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Sync Views
          </button>
          <button
            onClick={resetAllViews}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Reset All
          </button>
          <button
            onClick={() => adjustWindowLevel(400, 40)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Soft Tissue
          </button>
          <button
            onClick={() => adjustWindowLevel(1500, 300)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Bone
          </button>
          <button
            onClick={() => adjustWindowLevel(2000, -500)}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Lung
          </button>
        </div>
      </div>

      <div className="mpr-viewports grid grid-cols-2 gap-4 p-4 bg-gray-900">
        <div className="viewport-container">
          <div className="text-white text-sm mb-2 font-semibold">Axial</div>
          <div
            ref={axialRef}
            className="viewport bg-black rounded"
            style={{ width: '400px', height: '400px' }}
          />
        </div>

        <div className="viewport-container">
          <div className="text-white text-sm mb-2 font-semibold">Sagittal</div>
          <div
            ref={sagittalRef}
            className="viewport bg-black rounded"
            style={{ width: '400px', height: '400px' }}
          />
        </div>

        <div className="viewport-container">
          <div className="text-white text-sm mb-2 font-semibold">Coronal</div>
          <div
            ref={coronalRef}
            className="viewport bg-black rounded"
            style={{ width: '400px', height: '400px' }}
          />
        </div>

        <div className="viewport-container flex items-center justify-center">
          <div className="text-white text-center">
            <div className="text-6xl mb-4">🩻</div>
            <p className="text-sm">3D Volume Loaded</p>
            <p className="text-xs text-gray-400 mt-2">
              {seriesUrls.length} slices
            </p>
          </div>
        </div>
      </div>

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 rounded-lg">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-lg">Loading DICOM volume...</p>
            <p className="text-sm text-gray-400 mt-2">
              Processing {seriesUrls.length} slices
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
