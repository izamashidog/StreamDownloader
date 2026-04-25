import { FFmpegLoader } from './FFmpegLoader';
import type { TransmuxerOptions, TransmuxResult, SegmentInput } from './types';

export class Transmuxer {
  private loader: FFmpegLoader;
  private options: Required<TransmuxerOptions>;
  private ffmpeg: Awaited<ReturnType<FFmpegLoader['load']>> | null = null;

  constructor(options: TransmuxerOptions = {}) {
    this.loader = new FFmpegLoader({
      cdnUrl: options.ffmpegPath,
      onProgress: options.onProgress,
    });
    this.options = {
      ffmpegPath: options.ffmpegPath || '',
      onProgress: options.onProgress ?? (() => {}),
      onLog: options.onLog || (() => {}),
    };
  }

  async initialize(): Promise<void> {
    if (this.ffmpeg) return;
    this.ffmpeg = await this.loader.load();
  }

  async transmuxTStoMP4(
    segments: SegmentInput[],
    outputName: string = 'output.mp4'
  ): Promise<TransmuxResult> {
    await this.initialize();

    const ffmpeg = this.ffmpeg!;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const data = segment.data instanceof ArrayBuffer
        ? new Uint8Array(segment.data)
        : segment.data;
      await ffmpeg.writeFile(`input_${i}.ts`, data);
    }

    const inputArgs = segments.map((_, i) => ['-i', `input_${i}.ts`]).flat();
    const outputArgs = [
      ...inputArgs,
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      '-movflags', '+faststart',
      outputName,
    ];

    const startTime = Date.now();
    await ffmpeg.exec(outputArgs);
    const duration = (Date.now() - startTime) / 1000;

    const outputData = await ffmpeg.readFile(outputName);

    for (let i = 0; i < segments.length; i++) {
      await ffmpeg.writeFile(`input_${i}.ts`, new Uint8Array(0));
    }
    await ffmpeg.writeFile(outputName, new Uint8Array(0));

    return {
      data: outputData as Uint8Array,
      mimeType: 'video/mp4',
      duration,
      size: (outputData as Uint8Array).length,
    };
  }

  async transmuxM4StoMP4(
    initSegment: SegmentInput,
    mediaSegments: SegmentInput[],
    outputName: string = 'output.mp4'
  ): Promise<TransmuxResult> {
    await this.initialize();

    const ffmpeg = this.ffmpeg!;

    if (initSegment.data) {
      const initData = initSegment.data instanceof ArrayBuffer
        ? new Uint8Array(initSegment.data)
        : initSegment.data;
      await ffmpeg.writeFile('init.mp4', initData);
    }

    for (let i = 0; i < mediaSegments.length; i++) {
      const segment = mediaSegments[i];
      const data = segment.data instanceof ArrayBuffer
        ? new Uint8Array(segment.data)
        : segment.data;
      await ffmpeg.writeFile(`segment_${i}.m4s`, data);
    }

    const concatFile = mediaSegments
      .map((_, i) => `file 'segment_${i}.m4s'`)
      .join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatFile));

    const args = [
      '-i', 'init.mp4',
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      '-movflags', '+faststart',
      outputName,
    ];

    const startTime = Date.now();
    await ffmpeg.exec(args);
    const duration = (Date.now() - startTime) / 1000;

    const outputData = await ffmpeg.readFile(outputName);

    await ffmpeg.writeFile('init.mp4', new Uint8Array(0));
    for (let i = 0; i < mediaSegments.length; i++) {
      await ffmpeg.writeFile(`segment_${i}.m4s`, new Uint8Array(0));
    }
    await ffmpeg.writeFile('concat.txt', new Uint8Array(0));
    await ffmpeg.writeFile(outputName, new Uint8Array(0));

    return {
      data: outputData as Uint8Array,
      mimeType: 'video/mp4',
      duration,
      size: (outputData as Uint8Array).length,
    };
  }

  async mergeMP4Segments(
    segments: SegmentInput[],
    outputName: string = 'merged.mp4'
  ): Promise<TransmuxResult> {
    await this.initialize();

    const ffmpeg = this.ffmpeg!;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const data = segment.data instanceof ArrayBuffer
        ? new Uint8Array(segment.data)
        : segment.data;
      await ffmpeg.writeFile(`segment_${i}.mp4`, data);
    }

    const concatFile = segments
      .map((_, i) => `file 'segment_${i}.mp4'`)
      .join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatFile));

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-movflags', '+faststart',
      outputName,
    ];

    const startTime = Date.now();
    await ffmpeg.exec(args);
    const duration = (Date.now() - startTime) / 1000;

    const outputData = await ffmpeg.readFile(outputName);

    for (let i = 0; i < segments.length; i++) {
      await ffmpeg.writeFile(`segment_${i}.mp4`, new Uint8Array(0));
    }
    await ffmpeg.writeFile('concat.txt', new Uint8Array(0));
    await ffmpeg.writeFile(outputName, new Uint8Array(0));

    return {
      data: outputData as Uint8Array,
      mimeType: 'video/mp4',
      duration,
      size: (outputData as Uint8Array).length,
    };
  }

  async convertCodec(
    inputData: ArrayBuffer,
    inputFormat: 'ts' | 'm4s' | 'mp4',
    outputFormat: 'mp4' = 'mp4',
    outputName: string = 'converted.mp4'
  ): Promise<TransmuxResult> {
    await this.initialize();

    const ffmpeg = this.ffmpeg!;
    const ext = inputFormat;
    const inputName = `input.${ext}`;

    const data = inputData instanceof ArrayBuffer
      ? new Uint8Array(inputData)
      : inputData;
    await ffmpeg.writeFile(inputName, data);

    const args = [
      '-i', inputName,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputName,
    ];

    const startTime = Date.now();
    await ffmpeg.exec(args);
    const duration = (Date.now() - startTime) / 1000;

    const outputData = await ffmpeg.readFile(outputName);

    await ffmpeg.writeFile(inputName, new Uint8Array(0));
    await ffmpeg.writeFile(outputName, new Uint8Array(0));

    return {
      data: outputData as Uint8Array,
      mimeType: 'video/mp4',
      duration,
      size: (outputData as Uint8Array).length,
    };
  }

  isLoaded(): boolean {
    return this.loader.isLoaded();
  }

  terminate(): void {
    this.loader.terminate();
    this.ffmpeg = null;
  }

  static async checkSupport(): Promise<boolean> {
    return FFmpegLoader.checkSupport();
  }
}