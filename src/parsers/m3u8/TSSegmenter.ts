/**
 * TSSegmenter - Multi-threaded TS Segment Downloader
 * Supports resume, concurrency control, and progress callbacks
 */

import type {
  TSSegment,
  DownloadProgress,
  ProgressCallback,
  EncryptionKey,
} from '../../shared/types/m3u8';
import { AESDecryptor } from './AESDecryptor';

interface DownloadTask {
  segment: TSSegment;
  data: ArrayBuffer | null;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  retries: number;
  error?: Error;
  downloadedBytes: number;
}

interface SegmentCache {
  [url: string]: ArrayBuffer;
}

export class TSSegmenter {
  private concurrency: number;
  private maxRetries: number;
  private segmentCache: SegmentCache;
  private keyCache: Map<string, ArrayBuffer>;
  private activeDownloads: number;
  private aborted: boolean;
  private progressCallback: ProgressCallback | null;
  private totalBytes: number;
  private downloadedBytes: number;
  private startTime: number;
  private tasks: Map<number, DownloadTask>;

  constructor(options: {
    concurrency?: number;
    maxRetries?: number;
  } = {}) {
    this.concurrency = options.concurrency || 6;
    this.maxRetries = options.maxRetries || 3;
    this.segmentCache = {};
    this.keyCache = new Map();
    this.activeDownloads = 0;
    this.aborted = false;
    this.progressCallback = null;
    this.totalBytes = 0;
    this.downloadedBytes = 0;
    this.startTime = 0;
    this.tasks = new Map();
  }

  /**
   * Set progress callback
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Set key cache for encrypted segments
   */
  setKeyCache(keys: Map<string, ArrayBuffer>): void {
    this.keyCache = keys;
  }

  /**
   * Add encryption key to cache
   */
  addKey(url: string, data: ArrayBuffer): void {
    this.keyCache.set(url, data);
  }

  /**
   * Fetch encryption key from URL
   */
  async fetchKey(url: string): Promise<ArrayBuffer> {
    if (this.keyCache.has(url)) {
      return this.keyCache.get(url)!;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch key: ${response.status}`);
    }

    const data = await response.arrayBuffer();
    this.keyCache.set(url, data);
    return data;
  }

  /**
   * Download a single segment with optional decryption
   */
  async downloadSegment(
    segment: TSSegment,
    options: RequestInit = {}
  ): Promise<ArrayBuffer> {
    const cacheKey = segment.url;

    if (this.segmentCache[cacheKey]) {
      return this.segmentCache[cacheKey];
    }

    let response: Response;
    let data: ArrayBuffer;

    if (segment.byteRange && segment.byteRange.offset > 0) {
      const end = segment.byteRange.offset + segment.byteRange.length - 1;
      options.headers = {
        ...options.headers,
        Range: `bytes=${segment.byteRange.offset}-${end}`,
      };
    }

    response = await fetch(segment.url, options);
    if (!response.ok && response.status !== 206) {
      throw new Error(
        `Failed to download segment: ${response.status} ${response.statusText}`
      );
    }

    data = await response.arrayBuffer();

    if (segment.encryption && segment.encryption.method !== 'NONE') {
      const keyUrl = segment.encryption.key;
      if (keyUrl) {
        const keyData = await this.fetchKey(keyUrl);
        data = await AESDecryptor.decryptSegment(
          data,
          keyUrl,
          this.keyCache,
          segment.encryption
        );
      }
    }

    this.segmentCache[cacheKey] = data;
    return data;
  }

  /**
   * Download all segments with multi-threading
   */
  async downloadAll(
    segments: TSSegment[],
    options: RequestInit = {}
  ): Promise<ArrayBuffer[]> {
    this.aborted = false;
    this.tasks.clear();
    this.segmentCache = {};
    this.totalBytes = 0;
    this.downloadedBytes = 0;
    this.startTime = Date.now();

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const estimatedSize = segment.byteRange?.length || 188 * 100;
      this.totalBytes += estimatedSize;
      this.tasks.set(i, {
        segment,
        data: null,
        status: 'pending',
        retries: 0,
        downloadedBytes: 0,
      });
    }

    const downloadPromises: Promise<void>[] = [];

    for (let i = 0; i < segments.length; i++) {
      if (this.aborted) {
        break;
      }

      while (this.activeDownloads >= this.concurrency) {
        await this.waitForFreeSlot();
        if (this.aborted) {
          break;
        }
      }

      if (this.aborted) {
        break;
      }

      const taskIndex = this.findNextPendingTask();
      if (taskIndex >= 0) {
        const promise = this.downloadTask(taskIndex, options);
        downloadPromises.push(promise);
      }
    }

    await Promise.all(downloadPromises);

    const results: ArrayBuffer[] = [];
    for (let i = 0; i < segments.length; i++) {
      const task = this.tasks.get(i);
      if (task?.status === 'completed' && task.data) {
        results.push(task.data);
      } else {
        throw new Error(`Segment ${i} failed to download`);
      }
    }

    return results;
  }

  /**
   * Find next pending task index
   */
  private findNextPendingTask(): number {
    for (const [index, task] of this.tasks) {
      if (task.status === 'pending') {
        return index;
      }
    }
    return -1;
  }

  /**
   * Wait for a free download slot
   */
  private async waitForFreeSlot(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.activeDownloads < this.concurrency) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Download a single task
   */
  private async downloadTask(
    taskIndex: number,
    options: RequestInit
  ): Promise<void> {
    const task = this.tasks.get(taskIndex);
    if (!task) {
      return;
    }

    task.status = 'downloading';
    this.activeDownloads++;

    try {
      const data = await this.downloadSegmentWithRetry(task.segment, options);
      task.data = data;
      task.status = 'completed';
      this.downloadedBytes += data.byteLength;
      this.downloadedBytes += (task.segment.byteRange?.length || 0);
    } catch (error) {
      task.error = error instanceof Error ? error : new Error(String(error));
      task.status = 'error';
    } finally {
      this.activeDownloads--;
    }

    this.reportProgress();
  }

  /**
   * Download segment with retry logic
   */
  private async downloadSegmentWithRetry(
    segment: TSSegment,
    options: RequestInit,
    retries = 0
  ): Promise<ArrayBuffer> {
    try {
      return await this.downloadSegment(segment, options);
    } catch (error) {
      if (retries < this.maxRetries) {
        await this.delay(1000 * Math.pow(2, retries));
        return this.downloadSegmentWithRetry(segment, options, retries + 1);
      }
      throw error;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Report download progress
   */
  private reportProgress(): void {
    if (!this.progressCallback) {
      return;
    }

    const taskIndex = this.findNextPendingTask();
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? this.downloadedBytes / elapsed : 0;

    this.progressCallback({
      segmentId: taskIndex >= 0 ? taskIndex : this.tasks.size,
      totalSegments: this.tasks.size,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      speed,
      percentage:
        this.totalBytes > 0
          ? (this.downloadedBytes / this.totalBytes) * 100
          : 0,
    });
  }

  /**
   * Abort all downloads
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Get cached segment
   */
  getCachedSegment(url: string): ArrayBuffer | undefined {
    return this.segmentCache[url];
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.segmentCache = {};
  }
}
