import type { Segment, DownloadedSegment, M4SDownloadOptions } from "../../shared/types/mpd";
import { formatRangeHeader, parseRangeHeader } from "./dash-utils";

export interface M4SDownloaderOptions {
  maxConcurrency?: number;
  onProgress?: (segmentIndex: number, downloaded: number, total: number) => void;
  onSegmentComplete?: (segment: DownloadedSegment) => void;
  onComplete?: (segments: DownloadedSegment[]) => void;
  onError?: (error: Error, segmentIndex?: number) => void;
}

export class M4SDownloader {
  private maxConcurrency: number;
  private onProgress?: (segmentIndex: number, downloaded: number, total: number) => void;
  private onSegmentComplete?: (segment: DownloadedSegment) => void;
  private onComplete?: (segments: DownloadedSegment[]) => void;
  private onError?: (error: Error, segmentIndex?: number) => void;

  private activeDownloads = 0;
  private queue: Array<{
    segment: Segment;
    index: number;
    url: string;
    resolve: (segment: DownloadedSegment) => void;
    reject: (error: Error) => void;
  }> = [];
  private completedSegments: Map<number, DownloadedSegment> = new Map();
  private abortController: AbortController | null = null;
  private isPaused = false;

  constructor(options: M4SDownloaderOptions = {}) {
    this.maxConcurrency = options.maxConcurrency || 6;
    this.onProgress = options.onProgress;
    this.onSegmentComplete = options.onSegmentComplete;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  async downloadInitSegment(url: string, range?: { start: number; end: number }): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      headers: range ? { Range: formatRangeHeader(range.start, range.end) } : {},
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to download init segment: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  async downloadSegments(
    baseUrl: string,
    segments: Segment[],
    initUrl?: string
  ): Promise<DownloadedSegment[]> {
    this.abortController = new AbortController();
    this.completedSegments.clear();
    this.queue = [];
    this.activeDownloads = 0;
    this.isPaused = false;

    if (initUrl) {
      await this.downloadInitSegment(baseUrl + initUrl);
    }

    const promises: Promise<void>[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const promise = this.enqueueSegment(baseUrl, segment, i);
      promises.push(promise);
    }

    await Promise.all(promises);

    const result: DownloadedSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const completed = this.completedSegments.get(i);
      if (completed) {
        result.push(completed);
      }
    }

    if (this.onComplete) {
      this.onComplete(result);
    }

    return result;
  }

  private enqueueSegment(
    baseUrl: string,
    segment: Segment,
    index: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        segment,
        index,
        url: baseUrl + segment.url,
        resolve: (seg) => {
          this.completedSegments.set(index, seg);
          if (this.onSegmentComplete) {
            this.onSegmentComplete(seg);
          }
          resolve();
        },
        reject,
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.isPaused) return;

    while (this.activeDownloads < this.maxConcurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        this.activeDownloads++;
        this.downloadSegment(item).catch(item.reject);
      }
    }
  }

  private async downloadSegment(item: {
    segment: Segment;
    index: number;
    url: string;
    resolve: (segment: DownloadedSegment) => void;
    reject: (error: Error) => void;
  }): Promise<void> {
    const { segment, url } = item;
    let segmentIndex = item.index;

    try {
      let total = 0;
      let downloaded = 0;

      const response = await fetch(url, {
        signal: this.abortController?.signal,
        headers: segment.mediaRange
          ? {
              Range: segment.mediaRange,
            }
          : undefined,
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`Failed to download segment ${segmentIndex}: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get("Content-Length");
      total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          chunks.push(value);
          downloaded += value.length;

          if (this.onProgress) {
            this.onProgress(segmentIndex, downloaded, total);
          }
        }
      } else {
        const arrayBuffer = await response.arrayBuffer();
        chunks.push(new Uint8Array(arrayBuffer));
        downloaded = arrayBuffer.byteLength;
        total = arrayBuffer.byteLength;
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      item.resolve({
        index: segmentIndex,
        data: result.buffer,
        url,
      });

      this.activeDownloads--;
      this.processQueue();
    } catch (error) {
      this.activeDownloads--;
      this.processQueue();

      if (this.onError) {
        this.onError(error as Error, segmentIndex);
      }

      throw error;
    }
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.processQueue();
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.queue = [];
    this.activeDownloads = 0;
  }

  setConcurrency(concurrency: number): void {
    this.maxConcurrency = Math.max(1, Math.min(concurrency, 20));
    this.processQueue();
  }

  async downloadWithRange(
    url: string,
    options: M4SDownloadOptions
  ): Promise<ArrayBuffer> {
    const headers: HeadersInit = {};

    if (options.range) {
      headers["Range"] = formatRangeHeader(options.range.start, options.range.end);
    }

    const response = await fetch(url, {
      headers,
      signal: options.signal,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    const contentRange = response.headers.get("Content-Range");
    const total = contentRange
      ? parseRangeHeader(`bytes=${contentRange.split(" ")[1]}`)?.end
      : 0;

    if (options.onProgress && total) {
      const reader = response.body?.getReader();
      if (reader) {
        let downloaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          downloaded += value.length;
          options.onProgress(downloaded, total);
        }
        return new Uint8Array(downloaded).buffer;
      }
    }

    return response.arrayBuffer();
  }

  mergeSegments(segments: DownloadedSegment[]): ArrayBuffer {
    const sorted = [...segments].sort((a, b) => a.index - b.index);
    const totalLength = sorted.reduce((acc, seg) => acc + seg.data.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const seg of sorted) {
      result.set(new Uint8Array(seg.data), offset);
      offset += seg.data.byteLength;
    }

    return result.buffer;
  }
}
