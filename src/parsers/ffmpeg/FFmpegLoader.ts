interface FFmpegInstance {
  load: (options: { coreURL: string; wasmURL: string }) => Promise<void>;
  writeFile: (name: string, data: Uint8Array | ArrayBuffer) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  exec: (args: string[]) => Promise<number>;
  on: (event: string, callback: (data: { message: string; progress?: number; time?: number }) => void) => void;
  terminate: () => void;
}

interface FFmpegFactory {
  createFFmpeg: (options: { log?: boolean; progress?: (p: { progress: number; time: number }) => void }) => FFmpegInstance;
}

const DEFAULT_FFMPEG_CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
const DEFAULT_WASM_CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';

export interface FFmpegLoaderOptions {
  cdnUrl?: string;
  wasmUrl?: string;
  onProgress?: (progress: number) => void;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
}

export class FFmpegLoader {
  private ffmpeg: FFmpegInstance | null = null;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private cdnUrl: string;
  private wasmUrl: string;
  private onProgress?: (progress: number) => void;

  constructor(options: FFmpegLoaderOptions = {}) {
    this.cdnUrl = options.cdnUrl || DEFAULT_FFMPEG_CDN;
    this.wasmUrl = options.wasmUrl || DEFAULT_WASM_CDN;
    this.onProgress = options.onProgress;
  }

  async load(): Promise<FFmpegInstance> {
    if (this.loaded && this.ffmpeg) {
      return this.ffmpeg;
    }

    if (this.loading) {
      await this.loading;
      return this.ffmpeg!;
    }

    this.loading = this.doLoad();
    await this.loading;
    return this.ffmpeg!;
  }

  private async doLoad(): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('FFmpegLoader can only be used in browser environment');
      }

      const ffmpegCore = await this.loadFFmpegCore();

      this.ffmpeg = ffmpegCore.createFFmpeg({
        log: false,
        progress: (p: { progress: number; time: number }) => {
          if (this.onProgress) {
            this.onProgress(p.progress);
          }
        },
      });

      await this.ffmpeg.load({
        coreURL: this.wasmUrl,
        wasmURL: this.wasmUrl,
      });

      this.loaded = true;
    } catch (error) {
      this.loading = null;
      throw error;
    }
  }

  private async loadFFmpegCore(): Promise<FFmpegFactory> {
    const win = window as unknown as Record<string, unknown>;
    const ffmpegFactory = win.ffmpeg as FFmpegFactory | undefined;
    if (ffmpegFactory?.createFFmpeg) {
      return ffmpegFactory;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this.cdnUrl;
      script.async = true;

      script.onload = () => {
        const ffmpeg = win.ffmpeg as FFmpegFactory | undefined;
        if (ffmpeg && typeof ffmpeg.createFFmpeg === 'function') {
          resolve(ffmpeg);
        } else {
          reject(new Error('FFmpeg core loaded but createFFmpeg not available'));
        }
      };

      script.onerror = () => {
        reject(new Error(`Failed to load FFmpeg from ${this.cdnUrl}`));
      };

      document.head.appendChild(script);
    });
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getInstance(): FFmpegInstance | null {
    return this.ffmpeg;
  }

  terminate(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
      this.loaded = false;
      this.loading = null;
    }
  }

  static async checkSupport(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      const sharedBuffer = new SharedArrayBuffer(1);
      return sharedBuffer instanceof SharedArrayBuffer;
    } catch {
      return false;
    }
  }
}