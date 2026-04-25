export interface MediaStream {
  id: string;
  url: string;
  type: 'm3u8' | 'mpd';
  mimeType: string;
  size: number;
  tabId: number;
  tabUrl: string;
  domain: string;
  timestamp: number;
  mediaType: 'video' | 'audio';
}

export interface FilterOptions {
  domains: string[];
  minSize: number;
  maxSize: number;
  mediaTypes: ('video' | 'audio')[];
  enabled: boolean;
}

export interface SnifferConfig {
  filters: FilterOptions;
  concurrency: number;
  autoDownload: boolean;
}

export interface StreamCandidate {
  url: string;
  type: 'm3u8' | 'mpd';
  contentType: string;
  size: number;
}
