import { Transmuxer } from './Transmuxer';
import { FFmpegLoader } from './FFmpegLoader';
import type { TransmuxerOptions, TransmuxResult, SegmentInput } from './types';

export interface MediaMuxerOptions extends TransmuxerOptions {
  lazyLoad?: boolean;
  autoTransmux?: boolean;
}

export class MediaMuxer {
  private transmuxer: Transmuxer | null = null;
  private options: Required<MediaMuxerOptions>;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: MediaMuxerOptions = {}) {
    this.options = {
      ffmpegPath: options.ffmpegPath || '',
      onProgress: options.onProgress ?? (() => {}),
      onLog: options.onLog || (() => {}),
      lazyLoad: options.lazyLoad ?? true,
      autoTransmux: options.autoTransmux ?? true,
    };

    if (!this.options.lazyLoad) {
      this.initialize();
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    this.transmuxer = new Transmuxer({
      onProgress: this.options.onProgress,
      onLog: this.options.onLog,
    });
    await this.transmuxer.initialize();
    this.initialized = true;
  }

  async transmuxTStoMP4(
    segments: SegmentInput[],
    outputName?: string
  ): Promise<TransmuxResult> {
    if (!this.transmuxer) {
      await this.initialize();
    }
    return this.transmuxer!.transmuxTStoMP4(segments, outputName);
  }

  async transmuxM4StoMP4(
    initSegment: SegmentInput,
    mediaSegments: SegmentInput[],
    outputName?: string
  ): Promise<TransmuxResult> {
    if (!this.transmuxer) {
      await this.initialize();
    }
    return this.transmuxer!.transmuxM4StoMP4(initSegment, mediaSegments, outputName);
  }

  async mergeMP4(segments: SegmentInput[], outputName?: string): Promise<TransmuxResult> {
    if (!this.transmuxer) {
      await this.initialize();
    }
    return this.transmuxer!.mergeMP4Segments(segments, outputName);
  }

  async transmux(segments: SegmentInput[], outputName: string = 'output.mp4'): Promise<TransmuxResult> {
    if (!this.transmuxer) {
      await this.initialize();
    }

    const tsSegments: SegmentInput[] = [];
    const m4sSegments: SegmentInput[] = [];
    let initSegment: SegmentInput | null = null;

    for (const seg of segments) {
      if (seg.type === 'init') {
        initSegment = seg;
      } else if (seg.type === 'ts') {
        tsSegments.push(seg);
      } else if (seg.type === 'm4s') {
        m4sSegments.push(seg);
      }
    }

    if (tsSegments.length > 0) {
      return this.transmuxer!.transmuxTStoMP4(tsSegments, outputName);
    }

    if (m4sSegments.length > 0) {
      if (initSegment) {
        return this.transmuxer!.transmuxM4StoMP4(initSegment, m4sSegments, outputName);
      } else {
        return this.transmuxer!.mergeMP4Segments(m4sSegments, outputName);
      }
    }

    throw new Error('No valid segments to transmux');
  }

  isLoaded(): boolean {
    return this.initialized;
  }

  async ensureLoaded(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  terminate(): void {
    if (this.transmuxer) {
      this.transmuxer.terminate();
      this.transmuxer = null;
      this.initialized = false;
      this.initPromise = null;
    }
  }

  static async checkSupport(): Promise<boolean> {
    return Transmuxer.checkSupport();
  }
}

export { Transmuxer } from './Transmuxer';
export { FFmpegLoader } from './FFmpegLoader';
export * from './types';