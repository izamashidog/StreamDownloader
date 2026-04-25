// Shared Message Utilities

import type {
  MessageType,
  StreamResource,
  DownloadTask,
  Settings,
  StartDownloadPayload,
  DownloadProgressPayload,
  ToastPayload
} from './types';
import type { ExternalTool, ExportOptions, GeneratedCommand } from './external-types';

// Message Handler Types
export type MessageHandler<T = unknown> = (payload: T, sender: chrome.runtime.MessageSender) => void;

// Message Bus for Service Worker
class MessageBus {
  private handlers: Map<MessageType, MessageHandler[]> = new Map();

  register(type: MessageType, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  unregister(type: MessageType, handler: MessageHandler): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      const index = typeHandlers.indexOf(handler);
      if (index > -1) {
        typeHandlers.splice(index, 1);
      }
    }
  }

  handle(type: MessageType, payload: unknown, sender: chrome.runtime.MessageSender): void {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => handler(payload, sender));
    }
  }
}

export const messageBus = new MessageBus();

// UI Helper Functions
export function sendMessage(type: MessageType, payload?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data: payload }, (response) => {
      resolve(response);
    });
  });
}

export function getSnifferList(): Promise<StreamResource[]> {
  return sendMessage('GET_SNIFFER_LIST') as Promise<StreamResource[]>;
}

export function getDownloadList(): Promise<DownloadTask[]> {
  return sendMessage('GET_DOWNLOAD_LIST') as Promise<DownloadTask[]>;
}

export function startDownload(payload: StartDownloadPayload): Promise<void> {
  return sendMessage('START_DOWNLOAD', payload) as Promise<void>;
}

export function pauseDownload(taskId: string): Promise<void> {
  return sendMessage('PAUSE_DOWNLOAD', { taskId }) as Promise<void>;
}

export function resumeDownload(taskId: string): Promise<void> {
  return sendMessage('RESUME_DOWNLOAD', { taskId }) as Promise<void>;
}

export function cancelDownload(taskId: string): Promise<void> {
  return sendMessage('CANCEL_DOWNLOAD', { taskId }) as Promise<void>;
}

export function getSettings(): Promise<Settings> {
  return sendMessage('GET_SETTINGS') as Promise<Settings>;
}

export function saveSettings(settings: Settings): Promise<void> {
  return sendMessage('SET_SETTINGS', settings) as Promise<void>;
}

export function toggleRecording(): Promise<void> {
  return sendMessage('TOGGLE_RECORDING') as Promise<void>;
}

export function getRecordingState(): Promise<boolean> {
  return sendMessage('GET_RECORDING_STATE') as Promise<boolean>;
}

export function openSidePanel(): Promise<void> {
  return sendMessage('OPEN_SIDEPANEL') as Promise<void>;
}

export function closeSidePanel(): Promise<void> {
  return sendMessage('CLOSE_SIDEPANEL') as Promise<void>;
}

// External Tool Functions
export function getExternalCommands(
  resource: StreamResource | DownloadTask,
  options?: ExportOptions
): Promise<GeneratedCommand[]> {
  return sendMessage('GET_EXTERNAL_COMMANDS', { resource, options }) as Promise<GeneratedCommand[]>;
}

export function getNM3U8DLCommand(
  url: string,
  options?: ExportOptions
): Promise<GeneratedCommand> {
  return sendMessage('GET_NM3U8DL_COMMAND', { url, options }) as Promise<GeneratedCommand>;
}

export function getYtdlpCommand(
  url: string,
  type: 'm3u8' | 'mpd' | 'Other',
  options?: ExportOptions
): Promise<GeneratedCommand> {
  return sendMessage('GET_YTDLP_COMMAND', { url, type, options }) as Promise<GeneratedCommand>;
}

export function getFFmpegCommand(
  url: string,
  type: 'm3u8' | 'mpd' | 'Other',
  options?: ExportOptions
): Promise<GeneratedCommand> {
  return sendMessage('GET_FFMPEG_COMMAND', { url, type, options }) as Promise<GeneratedCommand>;
}

export function exportCommandsJson(
  resource: StreamResource | DownloadTask,
  options?: ExportOptions
): Promise<string> {
  return sendMessage('EXPORT_COMMANDS_JSON', { resource, options }) as Promise<string>;
}

export function copyCommand(command: string): Promise<boolean> {
  return sendMessage('COPY_COMMAND', { command }) as Promise<boolean>;
}

export function openExternalTool(
  tool: 'n-m3u8dl-re' | 'yt-dlp' | 'ffmpeg',
  url: string
): Promise<void> {
  return sendMessage('OPEN_EXTERNAL_TOOL', { tool, url }) as Promise<void>;
}
