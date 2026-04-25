import { chrome } from 'webextension-polyfill';
import {
  DownloadTask,
  DownloadManagerConfig,
  DEFAULT_CONFIG,
  STORAGE_KEYS,
  DownloadStatus,
} from './types';
import { SegmentDownloader } from './SegmentDownloader';

/**
 * DownloadManager handles task queue, concurrency control, and download lifecycle
 */
export class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private queue: DownloadTask[] = [];
  private activeDownloads: Map<string, AbortController> = new Map();
  private config: DownloadManagerConfig;
  private segmentDownloader: SegmentDownloader;
  private isRunning: boolean = false;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(config: Partial<DownloadManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.segmentDownloader = new SegmentDownloader({
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      onProgress: (downloaded, total) => {
        // Progress callback handled per task
      },
    });
    this.loadTasks();
  }

  // ============ Event System ============

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  // ============ Task Management ============

  async addTask(task: Omit<DownloadTask, 'id' | 'status' | 'downloadedBytes' | 'retryCount' | 'createdAt' | 'updatedAt'>): Promise<DownloadTask> {
    const newTask: DownloadTask = {
      ...task,
      id: this.generateId(),
      status: 'pending',
      downloadedBytes: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(newTask.id, newTask);
    this.queue.push(newTask);
    this.queue.sort((a, b) => b.priority - a.priority);

    await this.saveTasks();
    this.emit('taskAdded', newTask);

    if (this.isRunning) {
      this.processNext();
    }

    return newTask;
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status: DownloadStatus): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  async removeTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    if (task.status === 'downloading') {
      await this.cancelDownload(id);
    }

    this.tasks.delete(id);
    this.queue = this.queue.filter(t => t.id !== id);
    await this.saveTasks();
    this.emit('taskRemoved', task);
  }

  async clearCompleted(): Promise<void> {
    const completed = Array.from(this.tasks.values()).filter(t => t.status === 'completed');
    for (const task of completed) {
      this.tasks.delete(task.id);
    }
    await this.saveTasks();
    this.emit('completedCleared', completed.length);
  }

  // ============ Download Control ============

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.processQueue();
  }

  stop(): void {
    this.isRunning = false;
  }

  async pauseTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'downloading') return;

    await this.cancelDownload(id);
    task.status = 'paused';
    task.updatedAt = Date.now();
    await this.saveTasks();
    this.emit('taskPaused', task);
  }

  async resumeTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'paused') return;

    task.status = 'pending';
    task.updatedAt = Date.now();
    if (!this.queue.find(t => t.id === id)) {
      this.queue.push(task);
      this.queue.sort((a, b) => b.priority - a.priority);
    }
    await this.saveTasks();
    this.emit('taskResumed', task);

    if (this.isRunning) {
      this.processNext();
    }
  }

  async cancelTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    if (task.status === 'downloading') {
      await this.cancelDownload(id);
    }

    task.status = 'error';
    task.error = 'Cancelled by user';
    task.updatedAt = Date.now();
    this.queue = this.queue.filter(t => t.id !== id);
    await this.saveTasks();
    this.emit('taskCancelled', task);
  }

  async retryTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'error') return;

    task.status = 'pending';
    task.retryCount = 0;
    task.downloadedBytes = 0;
    task.error = undefined;
    task.updatedAt = Date.now();
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority);
    await this.saveTasks();
    this.emit('taskRetried', task);

    if (this.isRunning) {
      this.processNext();
    }
  }

  // ============ Concurrency Control ============

  private async processQueue(): Promise<void> {
    while (this.isRunning && this.queue.length > 0) {
      const activeCount = Array.from(this.tasks.values()).filter(t => t.status === 'downloading').length;

      if (activeCount >= this.config.maxConcurrency) {
        await this.delay(100);
        continue;
      }

      this.processNext();
      await this.delay(50);
    }
  }

  private processNext(): void {
    if (this.activeDownloads.size >= this.config.maxConcurrency) return;

    const pendingTasks = this.queue.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) return;

    const task = pendingTasks[0];
    this.downloadTask(task);
  }

  private async downloadTask(task: DownloadTask): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(task.id, controller);

    task.status = 'downloading';
    task.updatedAt = Date.now();
    await this.saveTasks();
    this.emit('taskStarted', task);

    try {
      // Check if task supports range requests for resume
      const supportsRange = await this.checkRangeSupport(task.url);

      if (supportsRange && task.downloadedBytes > 0) {
        // Resume download with range
        await this.downloadWithResume(task, controller.signal);
      } else {
        // Full download
        await this.downloadFull(task, controller.signal);
      }

      task.status = 'completed';
      task.updatedAt = Date.now();
      await this.saveTasks();
      this.emit('taskCompleted', task);
    } catch (error) {
      task.retryCount++;

      if (task.retryCount < this.config.maxRetries) {
        task.status = 'pending';
        await this.delay(this.config.retryDelay * task.retryCount);
      } else {
        task.status = 'error';
        task.error = error instanceof Error ? error.message : String(error);
      }

      task.updatedAt = Date.now();
      await this.saveTasks();
      this.emit('taskError', { task, error });
    } finally {
      this.activeDownloads.delete(task.id);
      this.processNext();
    }
  }

  private async downloadFull(task: DownloadTask, signal: AbortSignal): Promise<void> {
    const response = await fetch(task.url, {
      signal,
      headers: {
        'Accept': task.mimeType || '*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    task.totalBytes = contentLength;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      task.downloadedBytes += value.length;
      task.updatedAt = Date.now();
      this.emit('taskProgress', task);

      if (signal.aborted) {
        reader.cancel();
        throw new Error('Download aborted');
      }
    }

    // Merge chunks and trigger browser download
    const blob = new Blob(chunks as BlobPart[]);
    await this.triggerBrowserDownload(task, blob);
  }

  private async downloadWithResume(task: DownloadTask, signal: AbortSignal): Promise<void> {
    const response = await fetch(task.url, {
      signal,
      headers: {
        'Accept': task.mimeType || '*/*',
        'Range': `bytes=${task.downloadedBytes}-`,
      },
    });

    if (response.status !== 206) {
      // Server doesn't support resume, restart from beginning
      task.downloadedBytes = 0;
      await this.downloadFull(task, signal);
      return;
    }

    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    const totalBytes = task.downloadedBytes + contentLength;
    task.totalBytes = totalBytes;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      task.downloadedBytes += value.length;
      task.updatedAt = Date.now();
      this.emit('taskProgress', task);

      if (signal.aborted) {
        reader.cancel();
        throw new Error('Download aborted');
      }
    }

    // Note: Resume downloads require filesystem access for proper partial file handling
    // Current implementation restarts from beginning if server doesn't support resume
    await this.triggerBrowserDownload(task, new Blob([new Uint8Array()]));
  }

  private async triggerBrowserDownload(task: DownloadTask, blob: Blob): Promise<void> {
    try {
      await chrome.downloads.download({
        url: URL.createObjectURL(blob),
        filename: task.filename,
        saveAs: true,
      });
    } catch (error) {
      console.error('Browser download failed:', error);
    }
  }

  private async checkRangeSupport(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Accept': '*/*' },
      });

      const acceptRanges = response.headers.get('Accept-Ranges');
      const contentRange = response.headers.get('Content-Range');

      return acceptRanges === 'bytes' || !!contentRange;
    } catch {
      return false;
    }
  }

  private async cancelDownload(id: string): Promise<void> {
    const controller = this.activeDownloads.get(id);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(id);
    }
  }

  // ============ Persistence ============

  private async loadTasks(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.TASKS);
      const tasks: DownloadTask[] = result[STORAGE_KEYS.TASKS] || [];

      tasks.forEach(task => {
        this.tasks.set(task.id, task);
        if (task.status === 'pending' || task.status === 'downloading') {
          task.status = 'paused';
          task.updatedAt = Date.now();
        }
      });

      this.queue = Array.from(this.tasks.values()).filter(t => t.status === 'pending' || t.status === 'paused');
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  private async saveTasks(): Promise<void> {
    try {
      const tasks = Array.from(this.tasks.values());
      await chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: tasks });
    } catch (error) {
      console.error('Failed to save tasks:', error);
    }
  }

  async addToHistory(task: DownloadTask): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
      const history: DownloadTask[] = result[STORAGE_KEYS.HISTORY] || [];

      history.unshift({ ...task, updatedAt: Date.now() });

      // Keep only last 100 entries
      const trimmed = history.slice(0, 100);
      await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: trimmed });
    } catch (error) {
      console.error('Failed to save to history:', error);
    }
  }

  async getHistory(): Promise<DownloadTask[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
      return result[STORAGE_KEYS.HISTORY] || [];
    } catch {
      return [];
    }
  }

  // ============ Configuration ============

  getConfig(): DownloadManagerConfig {
    return { ...this.config };
  }

  async updateConfig(config: Partial<DownloadManagerConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: this.config });
  }

  // ============ Utilities ============

  private generateId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let instance: DownloadManager | null = null;

export function getDownloadManager(config?: Partial<DownloadManagerConfig>): DownloadManager {
  if (!instance) {
    instance = new DownloadManager(config);
  }
  return instance;
}

export function resetDownloadManager(): void {
  instance?.stop();
  instance = null;
}
