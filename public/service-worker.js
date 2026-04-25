import { snifferEngine } from './service-worker/sniffer/index.js';

chrome.runtime.onInstalled.addListener(() => {
  snifferEngine.start();
  console.log('[StreamDownloader] SnifferEngine started');
});

chrome.runtime.onStartup.addListener(() => {
  snifferEngine.start();
  console.log('[StreamDownloader] SnifferEngine started on startup');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
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
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
});

export { snifferEngine };
