// Shared Constants

// Extension Info
export const EXTENSION_NAME = 'Stream Downloader';
export const EXTENSION_VERSION = '1.0.0';

// Default Settings
export const DEFAULT_SETTINGS = {
  downloadPath: '',
  concurrency: 6,
  autoDecrypt: true,
  notifications: true,
  language: 'en' as const,
  maxRetries: 3,
  timeout: 30000
};

// Storage Keys
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  SNIFFER_LIST: 'snifferList',
  DOWNLOAD_LIST: 'downloadList',
  RECORDING_STATE: 'recordingState'
};

// Content-Type patterns for stream detection
export const STREAM_CONTENT_TYPES = [
  'application/x-mpegURL',
  'application/vnd.apple.mpegurl',
  'application/dash+xml',
  'video/mp4'
];

// URL suffixes for stream detection
export const STREAM_URL_PATTERNS = [
  /\.m3u8$/i,
  /\.mpd$/i,
  /\/manifest\//i,
  /\=m3u8$/i,
  /\=mpd$/i
];

// Mime Types
export const MIME_TYPES = {
  M3U8: 'application/x-mpegURL',
  MPD: 'application/dash+xml',
  TS: 'video/mp2t',
  MP4: 'video/mp4',
  M4S: 'application/octet-stream'
};

// Download Status
export const DOWNLOAD_STATUS = {
  PENDING: 'pending',
  DOWNLOADING: 'downloading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
} as const;

// Stream Types
export const STREAM_TYPES = {
  HLS: 'm3u8',
  DASH: 'mpd',
  OTHER: 'Other'
} as const;

// Tab IDs
export const TAB_IDS = {
  SNiffer: 'sniffer',
  DOWNLOADS: 'downloads',
  PREVIEW: 'preview',
  SETTINGS: 'settings'
} as const;

// Animation durations (ms)
export const ANIMATION = {
  TOAST_DURATION: 3000,
  PROGRESS_UPDATE_INTERVAL: 500,
  SMOOTH_TRANSITION: 200
};

// File Extensions
export const FILE_EXTENSIONS = {
  HLS: '.mp4',
  DASH: '.mp4',
  TS: '.ts'
};

// Quality Labels
export const QUALITY_LABELS = {
  BEST: 'best',
  Q1080P: '1080p',
  Q720P: '720p',
  Q480P: '480p',
  Q360P: '360p'
};

// Audio Track Languages
export const AUDIO_LANGUAGES = {
  JAPANESE: 'ja',
  ENGLISH: 'en',
  CHINESE: 'zh'
};
