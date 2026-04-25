/**
 * External Tools Integration
 * Exports functionality for integrating with external download tools
 */

// Re-export types from shared module
export type { ExternalTool, ExportOptions, GeneratedCommand } from '../../shared/external-types';

export {
  externalToolExporter,
  generateNM3U8DLRECommand,
  generateYtdlpCommand,
  generateFFmpegCommand,
  generateAllCommands,
  exportToJson,
  copyToClipboard,
  openInExternalTool,
} from './ExternalToolExporter';
