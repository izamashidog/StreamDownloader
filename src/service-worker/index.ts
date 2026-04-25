// Stream Downloader Service Worker Entry Point
import { snifferEngine } from './sniffer';
import { getDownloadManager } from './download';
import { getLiveRecorder } from './LiveRecorder';
import {
  generateNM3U8DLRECommand,
  generateYtdlpCommand,
  generateFFmpegCommand,
  generateAllCommands,
  exportToJson,
  copyToClipboard,
  openInExternalTool,
} from './external';

import type { ExternalTool } from '../shared/external-types';

const downloadManager = getDownloadManager();
const liveRecorder = getLiveRecorder();

// Initialize sniffer engine on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  snifferEngine.start();
  console.log('[StreamDownloader] SnifferEngine started');
});

// Restart on browser startup
chrome.runtime.onStartup.addListener(() => {
  snifferEngine.start();
  console.log('[StreamDownloader] SnifferEngine started on startup');
});

// Handle messages from popup, sidepanel, and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    // Sniffer controls
    case 'GET_STREAMS':
      sendResponse({ streams: snifferEngine.getStreams() });
      break;
    case 'GET_STREAM':
      sendResponse({ stream: snifferEngine.getStreamById(message.id) });
      break;
    case 'CLEAR_STREAMS':
      snifferEngine.clearStreams();
      sendResponse({ success: true });
      break;
    case 'REMOVE_STREAM':
      sendResponse({ success: snifferEngine.removeStream(message.id) });
      break;
    case 'UPDATE_FILTERS':
      snifferEngine.updateFilters(message.filters);
      sendResponse({ success: true });
      break;
    case 'GET_SNIFFER_STATUS':
      sendResponse({ active: snifferEngine.isActive() });
      break;
    case 'START_SNIFFER':
      snifferEngine.start();
      sendResponse({ success: true });
      break;
    case 'STOP_SNIFFER':
      snifferEngine.stop();
      sendResponse({ success: true });
      break;

    // Download controls
    case 'GET_TASKS':
      sendResponse({ tasks: downloadManager.getAllTasks() });
      break;
    case 'GET_TASK':
      sendResponse({ task: downloadManager.getTask(message.id) });
      break;
    case 'ADD_DOWNLOAD_TASK':
      downloadManager.addTask(message.task).then(task => {
        sendResponse({ task });
      });
      return true;
    case 'PAUSE_TASK':
      downloadManager.pauseTask(message.id);
      sendResponse({ success: true });
      break;
    case 'RESUME_TASK':
      downloadManager.resumeTask(message.id);
      sendResponse({ success: true });
      break;
    case 'CANCEL_TASK':
      downloadManager.cancelTask(message.id);
      sendResponse({ success: true });
      break;
    case 'RETRY_TASK':
      downloadManager.retryTask(message.id);
      sendResponse({ success: true });
      break;
    case 'REMOVE_TASK':
      downloadManager.removeTask(message.id);
      sendResponse({ success: true });
      break;
    case 'CLEAR_COMPLETED':
      downloadManager.clearCompleted();
      sendResponse({ success: true });
      break;
    case 'START_DOWNLOADS':
      downloadManager.start();
      sendResponse({ success: true });
      break;
    case 'STOP_DOWNLOADS':
      downloadManager.stop();
      sendResponse({ success: true });
      break;

    // External tool integration
    case 'GET_EXTERNAL_COMMANDS':
      sendResponse({
        commands: generateAllCommands(message.resource, message.options),
      });
      break;
    case 'GET_NM3U8DL_COMMAND':
      sendResponse({
        command: generateNM3U8DLRECommand(message.url, message.options),
      });
      break;
    case 'GET_YTDLP_COMMAND':
      sendResponse({
        command: generateYtdlpCommand(message.url, message.type, message.options),
      });
      break;
    case 'GET_FFMPEG_COMMAND':
      sendResponse({
        command: generateFFmpegCommand(message.url, message.type, message.options),
      });
      break;
    case 'EXPORT_COMMANDS_JSON':
      sendResponse({
        json: exportToJson(message.resource, message.options),
      });
      break;
    case 'COPY_COMMAND':
      copyToClipboard(message.command).then(success => {
        sendResponse({ success });
      });
      return true;
    case 'OPEN_EXTERNAL_TOOL':
      openInExternalTool(message.tool as ExternalTool, message.url);
      sendResponse({ success: true });
      break;

    // Recording controls
    case 'GET_RECORDING_STATE':
      sendResponse({ isRecording: liveRecorder.isRecording(message.resourceId) });
      break;
    case 'START_RECORDING':
      liveRecorder.startRecording(message.resource).then(session => {
        sendResponse({ session });
      });
      return true;
    case 'STOP_RECORDING':
      liveRecorder.stopRecording(message.resourceId).then(session => {
        sendResponse({ session });
      });
      return true;
    case 'PAUSE_RECORDING':
      liveRecorder.pauseRecording(message.resourceId);
      sendResponse({ success: true });
      break;
    case 'RESUME_RECORDING':
      liveRecorder.resumeRecording(message.resourceId);
      sendResponse({ success: true });
      break;
    case 'GET_RECORDING_SESSIONS':
      sendResponse({ sessions: liveRecorder.getAllSessions() });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
});

// Start the download manager
downloadManager.start();

// Start recording session event handlers
liveRecorder.on((event, data) => {
  switch (event) {
    case 'started':
    case 'stopped':
      chrome.runtime.sendMessage({
        type: 'RECORDING_STATE_UPDATE',
        data,
      }).catch(() => {});
      break;
    case 'progress':
      chrome.runtime.sendMessage({
        type: 'RECORDING_PROGRESS_UPDATE',
        data,
      }).catch(() => {});
      break;
    case 'error':
      chrome.runtime.sendMessage({
        type: 'TOAST',
        data: { message: `Recording error: ${data}`, variant: 'error' },
      }).catch(() => {});
      break;
  }
});

export { snifferEngine, downloadManager, liveRecorder };
