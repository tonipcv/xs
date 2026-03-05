'use client';

/**
 * DICOM Viewer Component
 * Advanced medical image viewer with MPR, windowing, and measurements
 */

import React, { useEffect, useRef, useState } from 'react';

interface DicomViewerProps {
  dicomUrl: string;
  width?: number;
  height?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export default function DicomViewer({
  dicomUrl,
  width = 512,
  height = 512,
  onLoad,
  onError,
}: DicomViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [windowLevel, setWindowLevel] = useState({ width: 400, center: 40 });
  const [zoom, setZoom] = useState(1);
  const renderingEngineRef = useRef<any>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    initializeCornerstone();
  }, []);

  useEffect(() => {
    if (viewportRef.current && dicomUrl) {
      loadDicomImage();
    }
  }, [dicomUrl]);

  const initializeCornerstone = async () => {
    try {
      const cs: any = await import('@cornerstonejs/core').catch(() => null);
      const tools: any = await import('@cornerstonejs/tools').catch(() => null);
      if (!cs || !tools) {
        setAvailable(false);
        return;
      }
      await cs.init?.();
      tools.init?.();

      const engine = new cs.RenderingEngine('dicomViewerEngine');
      renderingEngineRef.current = engine;
      setAvailable(true);
    } catch (error) {
      console.error('Failed to initialize Cornerstone:', error);
      onError?.(error as Error);
    }
  };

  const loadDicomImage = async () => {
    const renderingEngine = renderingEngineRef.current;
    if (!viewportRef.current || !renderingEngine || !available) return;

    try {
      const cs: any = await import('@cornerstonejs/core');
      const viewportId = 'DICOM_VIEWPORT';
      const viewportInput = {
        viewportId,
        element: viewportRef.current,
        type: cs.Enums?.ViewportType?.STACK,
      };

      renderingEngine.enableElement?.(viewportInput);

      const viewport = renderingEngine.getViewport?.(viewportId);
      
      await viewport?.setStack?.([dicomUrl]);
      viewport?.render?.();

      setIsLoaded(true);
      onLoad?.();
    } catch (error) {
      console.error('Failed to load DICOM image:', error);
      onError?.(error as Error);
    }
  };

  const adjustWindowLevel = (width: number, center: number) => {
    setWindowLevel({ width, center });
    
    const renderingEngine = renderingEngineRef.current;
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport?.('DICOM_VIEWPORT');
      if (viewport) {
        viewport.setProperties?.({
          voiRange: {
            lower: center - width / 2,
            upper: center + width / 2,
          },
        });
        viewport.render?.();
      }
    }
  };

  const adjustZoom = (newZoom: number) => {
    setZoom(newZoom);
    
    const renderingEngine = renderingEngineRef.current;
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport?.('DICOM_VIEWPORT');
      if (viewport) {
        viewport.setZoom?.(newZoom);
        viewport.render?.();
      }
    }
  };

  const resetView = () => {
    setZoom(1);
    setWindowLevel({ width: 400, center: 40 });
    
    const renderingEngine = renderingEngineRef.current;
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport?.('DICOM_VIEWPORT');
      if (viewport) {
        viewport.resetCamera?.();
        viewport.resetProperties?.();
        viewport.render?.();
      }
    }
  };

  const enableMeasurementTool = async (toolName: string) => {
    const tools: any = await import('@cornerstonejs/tools').catch(() => null);
    if (!tools) return;
    const toolGroup = tools.ToolGroupManager.getToolGroup('dicomToolGroup');
    
    if (!toolGroup) {
      const newToolGroup = tools.ToolGroupManager.createToolGroup('dicomToolGroup');
      
      newToolGroup?.addTool(tools.LengthTool?.toolName || 'Length');
      newToolGroup?.addTool(tools.RectangleROITool?.toolName || 'RectangleROI');
      newToolGroup?.addTool(tools.EllipticalROITool?.toolName || 'EllipticalROI');
      newToolGroup?.addTool(tools.PanTool?.toolName || 'Pan');
      newToolGroup?.addTool(tools.ZoomTool?.toolName || 'Zoom');
      newToolGroup?.addTool(tools.WindowLevelTool?.toolName || 'WindowLevel');
      
      newToolGroup?.addViewport('DICOM_VIEWPORT', 'dicomViewerEngine');
    }
    
    const activeToolGroup = tools.ToolGroupManager.getToolGroup('dicomToolGroup');
    activeToolGroup?.setToolActive(toolName, {
      bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
    });
  };

  return (
    <div className="dicom-viewer-container">
      {!available && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded mb-2">
          DICOM viewer unavailable: '@cornerstonejs/core' not installed. Rendering placeholder.
        </div>
      )}
      <div className="dicom-controls bg-gray-100 p-4 rounded-t-lg">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex gap-2">
            <button
              onClick={() => adjustZoom(zoom + 0.1)}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Zoom In
            </button>
            <button
              onClick={() => adjustZoom(Math.max(0.1, zoom - 0.1))}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Zoom Out
            </button>
            <button
              onClick={resetView}
              className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Reset
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">Window:</label>
            <input
              type="range"
              min="1"
              max="2000"
              value={windowLevel.width}
              onChange={(e) => adjustWindowLevel(Number(e.target.value), windowLevel.center)}
              className="w-32"
            />
            <span className="text-sm">{windowLevel.width}</span>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">Level:</label>
            <input
              type="range"
              min="-1000"
              max="1000"
              value={windowLevel.center}
              onChange={(e) => adjustWindowLevel(windowLevel.width, Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm">{windowLevel.center}</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => enableMeasurementTool('Length')}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              title="Length Measurement"
            >
              📏
            </button>
            <button
              onClick={() => enableMeasurementTool('RectangleROI')}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              title="Rectangle ROI"
            >
              ▭
            </button>
            <button
              onClick={() => enableMeasurementTool('EllipticalROI')}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              title="Elliptical ROI"
            >
              ⬭
            </button>
            <button
              onClick={() => enableMeasurementTool('Pan')}
              className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
              title="Pan"
            >
              ✋
            </button>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="dicom-viewport bg-black rounded-b-lg"
        style={{ width: `${width}px`, height: `${height}px` }}
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 rounded-lg">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Loading DICOM image...</p>
          </div>
        </div>
      )}
    </div>
  );
}
