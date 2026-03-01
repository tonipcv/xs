'use client';

/**
 * DICOM Viewer Component
 * Advanced medical image viewer with MPR, windowing, and measurements
 */

import React, { useEffect, useRef, useState } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums } from '@cornerstonejs/core';

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
  const [renderingEngine, setRenderingEngine] = useState<RenderingEngine | null>(null);

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
      await cornerstone.init();
      cornerstoneTools.init();

      const engine = new RenderingEngine('dicomViewerEngine');
      setRenderingEngine(engine);
    } catch (error) {
      console.error('Failed to initialize Cornerstone:', error);
      onError?.(error as Error);
    }
  };

  const loadDicomImage = async () => {
    if (!viewportRef.current || !renderingEngine) return;

    try {
      const viewportId = 'DICOM_VIEWPORT';
      const viewportInput = {
        viewportId,
        element: viewportRef.current,
        type: Enums.ViewportType.STACK,
      };

      renderingEngine.enableElement(viewportInput);

      const viewport = renderingEngine.getViewport(viewportId);
      
      await viewport.setStack([dicomUrl]);
      viewport.render();

      setIsLoaded(true);
      onLoad?.();
    } catch (error) {
      console.error('Failed to load DICOM image:', error);
      onError?.(error as Error);
    }
  };

  const adjustWindowLevel = (width: number, center: number) => {
    setWindowLevel({ width, center });
    
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport('DICOM_VIEWPORT');
      if (viewport) {
        viewport.setProperties({
          voiRange: {
            lower: center - width / 2,
            upper: center + width / 2,
          },
        });
        viewport.render();
      }
    }
  };

  const adjustZoom = (newZoom: number) => {
    setZoom(newZoom);
    
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport('DICOM_VIEWPORT');
      if (viewport) {
        viewport.setZoom(newZoom);
        viewport.render();
      }
    }
  };

  const resetView = () => {
    setZoom(1);
    setWindowLevel({ width: 400, center: 40 });
    
    if (renderingEngine) {
      const viewport = renderingEngine.getViewport('DICOM_VIEWPORT');
      if (viewport) {
        viewport.resetCamera();
        viewport.resetProperties();
        viewport.render();
      }
    }
  };

  const enableMeasurementTool = (toolName: string) => {
    const toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup('dicomToolGroup');
    
    if (!toolGroup) {
      const newToolGroup = cornerstoneTools.ToolGroupManager.createToolGroup('dicomToolGroup');
      
      newToolGroup?.addTool(cornerstoneTools.LengthTool.toolName);
      newToolGroup?.addTool(cornerstoneTools.RectangleROITool.toolName);
      newToolGroup?.addTool(cornerstoneTools.EllipticalROITool.toolName);
      newToolGroup?.addTool(cornerstoneTools.PanTool.toolName);
      newToolGroup?.addTool(cornerstoneTools.ZoomTool.toolName);
      newToolGroup?.addTool(cornerstoneTools.WindowLevelTool.toolName);
      
      newToolGroup?.addViewport('DICOM_VIEWPORT', 'dicomViewerEngine');
    }
    
    const activeToolGroup = cornerstoneTools.ToolGroupManager.getToolGroup('dicomToolGroup');
    activeToolGroup?.setToolActive(toolName, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
    });
  };

  return (
    <div className="dicom-viewer-container">
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
              onClick={() => enableMeasurementTool(cornerstoneTools.LengthTool.toolName)}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              title="Length Measurement"
            >
              📏
            </button>
            <button
              onClick={() => enableMeasurementTool(cornerstoneTools.RectangleROITool.toolName)}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              title="Rectangle ROI"
            >
              ▭
            </button>
            <button
              onClick={() => enableMeasurementTool(cornerstoneTools.EllipticalROITool.toolName)}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              title="Elliptical ROI"
            >
              ⬭
            </button>
            <button
              onClick={() => enableMeasurementTool(cornerstoneTools.PanTool.toolName)}
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
