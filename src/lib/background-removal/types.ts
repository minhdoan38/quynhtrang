export type BackgroundRemovalStatus = 'idle' | 'processing' | 'result' | 'error';

export interface RemovalProviderOptions {
  maxDimension?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface RemovalResult {
  derivedSrc: string;
  maskDataUrl?: string;
  width: number;
  height: number;
  sourceDimensions: { width: number; height: number };
}

export interface BackgroundRemovalProvider {
  name: string;
  isAvailable(): boolean;
  removeBackground(
    sourceUrl: string,
    options?: RemovalProviderOptions
  ): Promise<RemovalResult>;
}

export type BrushMode = 'erase' | 'restore';

export interface StrokePoint {
  x: number;
  y: number;
}

export interface BrushStroke {
  id: string;
  mode: BrushMode;
  size: number;
  points: StrokePoint[];
}

export interface RefineSessionState {
  strokes: BrushStroke[];
  currentMode: BrushMode;
  brushSize: number;
  showOriginal: boolean;
  canUndo: boolean;
}
