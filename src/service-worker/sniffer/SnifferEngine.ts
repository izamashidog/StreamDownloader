import { MediaStream, FilterOptions, SnifferConfig, StreamCandidate } from '../../types';
import { MEDIA_TYPES } from '../../config/media-types';

export class SnifferEngine {
  private streams: Map<string, MediaStream> = new Map();
  private seenUrls: Set<string> = new Set();
  private config: SnifferConfig;
  private isListening: boolean = false;

  private readonly MAX_STREAMS = 1000;
  private readonly URL_EXPIRY_MS = 30 * 60 * 1000;

  constructor(config: Partial<SnifferConfig> = {}) {
    this.config = {
      filters: {
        domains: [],
        minSize: 0,
        maxSize: Infinity,
        mediaTypes: [],
        enabled: true
      },
      concurrency: 6,
      autoDownload: false,
      ...config
    };
  }

  private detectStreamType(url: string, contentType: string): StreamCandidate | null {
    const urlLower = url.toLowerCase();
    const ext = this.getUrlExtension(urlLower);

    if (!ext) return null;

    if (MEDIA_TYPES.M3U8.extensions.includes(ext)) {
      return {
        url,
        type: 'm3u8',
        contentType: contentType || 'application/vnd.apple.mpegurl',
        size: 0
      };
    }

    if (MEDIA_TYPES.MPD.extensions.includes(ext)) {
      return {
        url,
        type: 'mpd',
        contentType: contentType || 'application/dash+xml',
        size: 0
      };
    }

    const matchedContentType = this.matchContentType(contentType);
    if (matchedContentType) {
      return {
        url,
        type: matchedContentType,
        contentType,
        size: 0
      };
    }

    return null;
  }

  private getUrlExtension(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastDot = pathname.lastIndexOf('.');
      if (lastDot === -1 || lastDot === pathname.length - 1) return '';
      return pathname.slice(lastDot);
    } catch {
      return '';
    }
  }

  private matchContentType(contentType: string): 'm3u8' | 'mpd' | null {
    if (!contentType) return null;
    const ct = contentType.toLowerCase();

    if (ct.includes('mpegurl') || ct.includes('apple.mpegurl')) {
      return 'm3u8';
    }
    if (ct.includes('dash+xml') || ct.includes('xml')) {
      return 'mpd';
    }
    return null;
  }

  private classifyMediaType(url: string): 'video' | 'audio' {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('audio') || urlLower.includes('.aac') || urlLower.includes('.mp3')) {
      return 'audio';
    }
    return 'video';
  }

  private generateStreamId(url: string): string {
    // Use btoa for browser-compatible base64 encoding
    const base64 = btoa(url).replace(/=+$/, '');
    return base64.slice(0, 32);
  }

  private applyFilters(stream: MediaStream): boolean {
    if (!this.config.filters.enabled) return true;

    const { domains, minSize, maxSize, mediaTypes } = this.config.filters;

    if (domains.length > 0 && !domains.some(d => stream.domain.includes(d))) {
      return false;
    }

    if (stream.size > 0) {
      if (stream.size < minSize || stream.size > maxSize) {
        return false;
      }
    }

    if (mediaTypes.length > 0 && !mediaTypes.includes(stream.mediaType)) {
      return false;
    }

    return true;
  }

  private cleanupExpiredStreams(): void {
    const now = Date.now();
    for (const [id, stream] of this.streams.entries()) {
      if (now - stream.timestamp > this.URL_EXPIRY_MS) {
        this.streams.delete(id);
      }
    }

    if (this.streams.size > this.MAX_STREAMS) {
      const entries = Array.from(this.streams.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, entries.length - this.MAX_STREAMS);
      toDelete.forEach(([id]) => this.streams.delete(id));
    }
  }

  onRequestCompleted(details: chrome.webRequest.WebResponseDetails & { responseHeaders?: chrome.webRequest.HttpHeader[] }): void {
    if (details.statusCode < 200 || details.statusCode >= 400) return;

    const url = details.url;
    const contentType = this.getHeaderValue(details.responseHeaders, 'content-type');
    const contentLength = this.getHeaderValue(details.responseHeaders, 'content-length');

    if (this.seenUrls.has(url)) return;

    const candidate = this.detectStreamType(url, contentType || '');
    if (!candidate) return;

    if (contentLength) {
      candidate.size = parseInt(contentLength, 10);
    }

    this.seenUrls.add(url);

    const stream: MediaStream = {
      id: this.generateStreamId(url),
      url,
      type: candidate.type,
      mimeType: candidate.contentType,
      size: candidate.size,
      tabId: details.tabId,
      tabUrl: '', // Will be populated asynchronously if needed
      domain: this.extractDomain(url),
      timestamp: Date.now(),
      mediaType: this.classifyMediaType(url)
    };

    if (!this.applyFilters(stream)) return;

    this.cleanupExpiredStreams();

    this.streams.set(stream.id, stream);
    this.notifyListeners(stream);
  }

  private getHeaderValue(
    headers: chrome.webRequest.HttpHeader[] | undefined,
    name: string
  ): string | undefined {
    if (!headers) return undefined;
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header?.value;
  }

  private async getTabUrl(tabId: number): Promise<string> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url || '';
    } catch {
      return '';
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private notifyListeners(stream: MediaStream): void {
    chrome.runtime.sendMessage({
      type: 'STREAM_DETECTED',
      payload: stream
    }).catch(() => {});
  }

  start(): void {
    if (this.isListening) return;
    this.isListening = true;

    chrome.webRequest.onCompleted.addListener(
      (details) => this.onRequestCompleted(details),
      {
        types: ['media', 'xmlhttprequest'],
        urls: ['<all_urls>']
      }
    );
  }

  stop(): void {
    this.isListening = false;
    try {
      chrome.webRequest.onCompleted.removeListener((details) => this.onRequestCompleted(details));
    } catch {}
  }

  getStreams(): MediaStream[] {
    return Array.from(this.streams.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getStreamById(id: string): MediaStream | undefined {
    return this.streams.get(id);
  }

  getStreamsByDomain(domain: string): MediaStream[] {
    return this.getStreams().filter(s => s.domain.includes(domain));
  }

  clearStreams(): void {
    this.streams.clear();
  }

  removeStream(id: string): boolean {
    const stream = this.streams.get(id);
    if (stream) {
      this.seenUrls.delete(stream.url);
      return this.streams.delete(id);
    }
    return false;
  }

  updateConfig(config: Partial<SnifferConfig>): void {
    this.config = { ...this.config, ...config };
  }

  updateFilters(filters: Partial<FilterOptions>): void {
    this.config.filters = { ...this.config.filters, ...filters };
  }

  isActive(): boolean {
    return this.isListening;
  }
}

export const snifferEngine = new SnifferEngine();
