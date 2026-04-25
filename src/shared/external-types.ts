/**
 * External Tool Types
 * Shared types for external tool integration
 */

/**
 * Supported external tools
 */
export type ExternalTool = 'n-m3u8dl-re' | 'yt-dlp' | 'ffmpeg';

/**
 * Tool command generation options
 */
export interface ExportOptions {
  /** Output filename template */
  outputName?: string;
  /** Custom headers for requests */
  headers?: Record<string, string>;
  /** Video quality selection (for yt-dlp) */
  quality?: string;
  /** Audio track selection (for yt-dlp) */
  audioTrack?: string;
  /** Custom FFmpeg parameters */
  ffmpegParams?: string;
}

/**
 * Generated command result
 */
export interface GeneratedCommand {
  tool: ExternalTool;
  command: string;
  description: string;
}
