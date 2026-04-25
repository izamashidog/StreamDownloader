import { SegmentResult } from './types';

export interface SegmentDownloaderOptions {
  maxRetries: number;
  retryDelay: number;
  onProgress?: (downloaded: number, total: number) => void;
}

/**
 * SegmentDownloader handles single segment download with Range request support
 */
export class SegmentDownloader {
  private maxRetries: number;
  private retryDelay: number;
  private onProgress?: (downloaded: number, total: number) => void;

  constructor(options: SegmentDownloaderOptions) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.onProgress = options.onProgress;
  }

  /**
   * Download a segment with optional Range header support
   */
  async download(url: string, options?: {
    range?: { start: number; end: number };
    headers?: Record<string, string>;
  }): Promise<SegmentResult> {
    const { range, headers = {} } = options || {};

    // Build Range header if provided
    if (range) {
      headers['Range'] = `bytes=${range.start}-${range.end}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            ...headers,
            'Accept': '*/*',
            ...(range ? { 'Range': `bytes=${range.start}-${range.end}` } : {}),
          },
        });

        if (!response.ok && response.status !== 206) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = this.parseContentLength(response.headers.get('Content-Length') || '');
        const buffer = await response.arrayBuffer();

        if (this.onProgress && contentLength > 0) {
          this.onProgress(buffer.byteLength, contentLength);
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key.toLowerCase()] = value;
        });

        return {
          data: buffer,
          status: response.status,
          headers: responseHeaders,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError || new Error('Download failed');
  }

  /**
   * Download multiple segments in parallel
   */
  async downloadParallel(
    segments: Array<{ url: string; range?: { start: number; end: number } }>,
    concurrency: number = 3
  ): Promise<SegmentResult[]> {
    const results: SegmentResult[] = [];
    const queue = [...segments];
    const active: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const segment = queue.shift()!;
        const result = await this.download(segment.url, { range: segment.range });
        results.push(result);
      }
    };

    for (let i = 0; i < concurrency; i++) {
      active.push(processNext());
    }

    await Promise.all(active);
    return results;
  }

  private parseContentLength(header: string): number {
    const value = parseInt(header, 10);
    return isNaN(value) ? 0 : value;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
