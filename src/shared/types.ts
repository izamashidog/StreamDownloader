// Shared Types for Stream Downloader Extension

// Stream Resource detected by sniffer
export interface StreamResource {
  id: string;
  name: string;
  url: string;
  type: 'm3u8' | 'mpd' | 'Other';
  size: number;
  resolution?: string;
  duration?: string;
  audioTracks?: string[];
  headers?: Record<string, string>;
  isLive?: boolean;
}

// Download Task
export interface DownloadTask {
  id: string;
  resourceId: string;
  name: string;
  url: string;
  type: 'm3u8' | 'mpd' | 'Other';
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  progress: number;
  speed: number;
  eta: string;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  filePath?: string;
}

// Settings
export interface Settings {
  downloadPath: string;
  concurrency: number;
  autoDecrypt: boolean;
  notifications: boolean;
  language: 'en' | 'zh-CN' | 'ja';
  maxRetries: number;
  timeout: number;
}

// Message Types for Service Worker Communication
export type MessageType =
  // Sniffer
  | 'GET_SNIFFER_LIST'
  | 'SNIFFER_LIST_UPDATE'
  | 'CLEAR_SNIFFER_LIST'
  | 'REFRESH_SNIFFER_LIST'
  // Downloads
  | 'GET_DOWNLOAD_LIST'
  | 'DOWNLOAD_LIST_UPDATE'
  | 'START_DOWNLOAD'
  | 'PAUSE_DOWNLOAD'
  | 'RESUME_DOWNLOAD'
  | 'CANCEL_DOWNLOAD'
  | 'CLEAR_COMPLETED_DOWNLOADS'
  | 'DOWNLOAD_PROGRESS_UPDATE'
  | 'SPEED_UPDATE'
  // Recording
  | 'GET_RECORDING_STATE'
  | 'TOGGLE_RECORDING'
  | 'RECORDING_STATE'
  // UI
  | 'OPEN_SIDEPANEL'
  | 'CLOSE_SIDEPANEL'
  | 'TOAST'
  // Settings
  | 'GET_SETTINGS'
  | 'SET_SETTINGS'
  | 'SETTINGS_UPDATE'
  // External Tools
  | 'GET_EXTERNAL_COMMANDS'
  | 'GET_NM3U8DL_COMMAND'
  | 'GET_YTDLP_COMMAND'
  | 'GET_FFMPEG_COMMAND'
  | 'EXPORT_COMMANDS_JSON'
  | 'COPY_COMMAND'
  | 'OPEN_EXTERNAL_TOOL';

// Message Payloads
export interface StartDownloadPayload {
  resourceId: string;
  name: string;
  url: string;
  type: 'm3u8' | 'mpd' | 'Other';
  quality?: string;
  audioTrack?: string;
}

export interface DownloadProgressPayload {
  taskId: string;
  progress: number;
  speed: number;
  eta: string;
  downloadedBytes: number;
}

export interface ToastPayload {
  message: string;
  variant: 'success' | 'error' | 'info';
}

// M3U8 Parser Types
export interface M3U8Segment {
  url: string;
  duration: number;
  sequence: number;
  key?: {
    method: string;
    uri?: string;
    iv?: string;
  };
}

export interface M3U8Variant {
  resolution: string;
  bandwidth: number;
  url: string;
  codecs?: string;
}

// MPD Parser Types
export interface MPDSegment {
  url: string;
  number: number;
  duration: number;
}

export interface MPDRepresentation {
  id: string;
  bandwidth: number;
  width?: number;
  height?: number;
  mimeType: string;
  segments: MPDSegment[];
}

// FFmpeg Types
export interface FFmpegProgress {
  progress: number;
  time: number;
}

export interface FFmpegResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}
