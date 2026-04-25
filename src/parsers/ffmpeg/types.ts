export interface TransmuxerOptions {
  ffmpegPath?: string;
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export interface TransmuxResult {
  data: Uint8Array;
  mimeType: string;
  duration: number;
  size: number;
}

export interface SegmentInput {
  data: ArrayBuffer | Uint8Array;
  type: 'ts' | 'm4s' | 'init';
  index?: number;
}

export interface FFmpegProgress {
  progress: number;
  time: number;
}