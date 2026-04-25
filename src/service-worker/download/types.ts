/**
 * Download task status
 */
export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'error';

/**
 * Download task interface
 */
export interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  totalBytes: number;
  downloadedBytes: number;
  status: DownloadStatus;
  priority: number;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  mimeType?: string;
  headers?: Record<string, string>;
  /** Stream type: 'm3u8' or 'mpd' */
  streamType?: 'm3u8' | 'mpd';
  /** Source stream ID if created from sniffer */
  streamId?: string;
  /** Source tab ID */
  tabId?: number;
  /** Source tab URL */
  tabUrl?: string;
}

/**
 * Segment download result
 */
export interface SegmentResult {
  data: ArrayBuffer;
  status: number;
  headers: Record<string, string>;
}

/**
 * Download progress callback
 */
export type ProgressCallback = (task: DownloadTask) => void;

/**
 * Download error callback
 */
export type ErrorCallback = (task: DownloadTask, error: Error) => void;

/**
 * Download complete callback
 */
export type CompleteCallback = (task: DownloadTask, blob: Blob) => void;

/**
 * Download manager config
 */
export interface DownloadManagerConfig {
  maxConcurrency: number;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: DownloadManagerConfig = {
  maxConcurrency: 6,
  chunkSize: 1024 * 1024, // 1MB
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * Storage keys
 */
export const STORAGE_KEYS = {
  TASKS: 'download_tasks',
  CONFIG: 'download_config',
  HISTORY: 'download_history',
} as const;
