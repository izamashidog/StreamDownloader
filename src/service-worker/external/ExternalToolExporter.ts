/**
 * External Tool Exporter
 * Generates download commands for external tools like N_m3u8DL-RE, yt-dlp, and FFmpeg
 */

import type { StreamResource, DownloadTask } from '../../shared/types';
import type { ExternalTool, ExportOptions, GeneratedCommand } from '../../shared/external-types';

/**
 * N_m3u8DL-RE command generator
 * N_m3u8DL-RE: https://github.com/nilaoda/N_m3u8DL-RE
 */
export function generateNM3U8DLRECommand(
  url: string,
  options: ExportOptions = {}
): GeneratedCommand {
  const args: string[] = [
    'N_m3u8DL-RE',
    `"${url}"`,
    '--save-name',
    `"${options.outputName || 'output'}"`,
    '--auto-select-quality',
    '--no-split',
    '--no-log',
  ];

  // Add custom headers if provided
  if (options.headers) {
    const headerStr = Object.entries(options.headers)
      .map(([k, v]) => `"${k}:${v}"`)
      .join(' ');
    args.push('--headers', `"${headerStr}"`);
  }

  return {
    tool: 'n-m3u8dl-re',
    command: args.join(' '),
    description: 'N_m3u8DL-RE command for HLS/DASH download',
  };
}

/**
 * yt-dlp command generator
 * yt-dlp: https://github.com/yt-dlp/yt-dlp
 */
export function generateYtdlpCommand(
  url: string,
  type: 'm3u8' | 'mpd' | 'Other',
  options: ExportOptions = {}
): GeneratedCommand {
  const args: string[] = ['yt-dlp'];

  // Add format selection based on type
  if (type === 'm3u8') {
    args.push('-f', '"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"');
  } else if (type === 'mpd') {
    args.push('-f', '"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"');
  }

  // Add quality preference if specified
  if (options.quality) {
    args.push('-f', `"bestvideo[height<=${options.quality}]+bestaudio/best[height<=${options.quality}]"`);
  }

  // Add audio track selection if specified
  if (options.audioTrack) {
    args.push('--audio-select', `"${options.audioTrack}"`);
  }

  // Add output template
  args.push('-o', `"${options.outputName || '%(title)s-%(id)s.%(ext)s'}"`);

  // Add custom headers if provided
  if (options.headers) {
    const headerList = Object.entries(options.headers)
      .map(([k, v]) => `${k}:${v}`)
      .join('; ');
    args.push('--add-headers', `"${headerList}"`);
  }

  // Add download section if it's a live stream
  args.push('--live-from-start');

  // Add the URL
  args.push(`"${url}"`);

  return {
    tool: 'yt-dlp',
    command: args.join(' '),
    description: 'yt-dlp command for HLS/DASH download',
  };
}

/**
 * FFmpeg direct command generator
 * For users who want to use FFmpeg directly
 */
export function generateFFmpegCommand(
  url: string,
  type: 'm3u8' | 'mpd' | 'Other',
  options: ExportOptions = {}
): GeneratedCommand {
  const args: string[] = ['ffmpeg'];

  // Add headers if provided
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      args.push('-headers', `"${key}: ${value}"`);
    });
  }

  // Add input
  args.push('-i', `"${url}"`);

  // Add custom FFmpeg parameters if specified
  if (options.ffmpegParams) {
    args.push(...options.ffmpegParams.split(' '));
  } else {
    // Default: copy codec for efficiency
    args.push('-c', 'copy');
    args.push('-bsf:a', 'aac_adtstoasc');
  }

  // Add output
  args.push('-y', `"${options.outputName || 'output.mp4'}"`);

  return {
    tool: 'ffmpeg',
    command: args.join(' '),
    description: 'FFmpeg command for direct stream download',
  };
}

/**
 * Generate commands for all supported tools
 */
export function generateAllCommands(
  resource: StreamResource | DownloadTask,
  options: ExportOptions = {}
): GeneratedCommand[] {
  const url = 'url' in resource ? resource.url : '';
  const type = 'type' in resource ? resource.type : 'Other';

  return [
    generateNM3U8DLRECommand(url, options),
    generateYtdlpCommand(url, type, options),
    generateFFmpegCommand(url, type, options),
  ];
}

/**
 * Export commands to JSON format (for configuration files)
 */
export function exportToJson(
  resource: StreamResource | DownloadTask,
  options: ExportOptions = {}
): string {
  const commands = generateAllCommands(resource, options);
  return JSON.stringify(
    {
      url: 'url' in resource ? resource.url : '',
      name: 'name' in resource ? resource.name : options.outputName || 'output',
      type: 'type' in resource ? resource.type : 'Other',
      commands: commands.map((c) => ({
        tool: c.tool,
        command: c.command,
        description: c.description,
      })),
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Copy text to clipboard via Chrome API
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Open external tool URL with the stream URL
 */
export function openInExternalTool(
  tool: ExternalTool,
  url: string
): void {
  const urls: Record<ExternalTool, string> = {
    'n-m3u8dl-re': `n-m3u8dl-re://open?url=${encodeURIComponent(url)}`,
    'yt-dlp': `https://github.com/yt-dlp/yt-dlp`,
    'ffmpeg': `https://ffmpeg.org/`,
  };

  // For N_m3u8DL-RE, use a custom protocol handler if available
  if (tool === 'n-m3u8dl-re') {
    window.open(urls[tool], '_blank');
  } else {
    window.open(urls[tool], '_blank');
  }
}

export const externalToolExporter = {
  generateNM3U8DLRECommand,
  generateYtdlpCommand,
  generateFFmpegCommand,
  generateAllCommands,
  exportToJson,
  copyToClipboard,
  openInExternalTool,
};

export default externalToolExporter;
