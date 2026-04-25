// Stream Downloader - Popup Script

// Types
interface StreamResource {
  id: string;
  name: string;
  url: string;
  type: 'm3u8' | 'mpd' | 'Other';
  size: number;
  resolution?: string;
  duration?: string;
  audioTracks?: string[];
}

interface DownloadTask {
  id: string;
  resourceId: string;
  name: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  speed: number;
  eta: string;
  error?: string;
}

interface Settings {
  downloadPath: string;
  concurrency: number;
  autoDecrypt: boolean;
  notifications: boolean;
  language: string;
}

// State
let snifferList: StreamResource[] = [];
let downloadList: DownloadTask[] = [];
let currentPreview: StreamResource | null = null;
let recordingState = {
  isRecording: false,
  sessionId: '',
  resourceId: '',
  duration: 0,
  totalBytes: 0,
  speed: 0
};
let settings: Settings = {
  downloadPath: '',
  concurrency: 6,
  autoDecrypt: true,
  notifications: true,
  language: 'en'
};

// DOM Elements
const elements = {
  // Tabs
  tabs: document.querySelectorAll('.tab') as NodeListOf<HTMLButtonElement>,
  panels: document.querySelectorAll('.panel') as NodeListOf<HTMLElement>,

  // Sniffer
  snifferList: document.getElementById('sniffer-list') as HTMLDivElement,
  snifferCount: document.getElementById('sniffer-count') as HTMLSpanElement,
  btnClearSniffer: document.getElementById('btn-clear-sniffer') as HTMLButtonElement,
  btnRefreshSniffer: document.getElementById('btn-refresh-sniffer') as HTMLButtonElement,

  // Downloads
  downloadList: document.getElementById('download-list') as HTMLDivElement,
  downloadCount: document.getElementById('download-count') as HTMLSpanElement,
  btnClearCompleted: document.getElementById('btn-clear-completed') as HTMLButtonElement,

  // Preview
  previewContainer: document.getElementById('video-preview-container') as HTMLDivElement,
  videoInfo: document.getElementById('video-info') as HTMLDivElement,
  qualitySelect: document.getElementById('quality-select') as HTMLSelectElement,
  audioSelect: document.getElementById('audio-select') as HTMLSelectElement,

  // Settings
  btnSettings: document.getElementById('btn-settings') as HTMLButtonElement,
  panelSettings: document.getElementById('panel-settings') as HTMLDivElement,
  settingDownloadPath: document.getElementById('setting-download-path') as HTMLInputElement,
  settingConcurrency: document.getElementById('setting-concurrency') as HTMLInputElement,
  settingAutoDecrypt: document.getElementById('setting-auto-decrypt') as HTMLInputElement,
  settingNotifications: document.getElementById('setting-notifications') as HTMLInputElement,
  settingLanguage: document.getElementById('setting-language') as HTMLSelectElement,

  // Footer
  statusText: document.getElementById('status-text') as HTMLSpanElement,
  speedDisplay: document.getElementById('speed-display') as HTMLDivElement,
  downloadSpeed: document.getElementById('download-speed') as HTMLSpanElement,
  btnStartRecording: document.getElementById('btn-start-recording') as HTMLButtonElement,
  btnSidepanel: document.getElementById('btn-sidpanel') as HTMLButtonElement
};

// Templates
const snifferItemTemplate = document.getElementById('sniffer-item-template') as HTMLTemplateElement;
const downloadItemTemplate = document.getElementById('download-item-template') as HTMLTemplateElement;

// Tab Navigation
function initTabs(): void {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      // Update active tab
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding panel
      elements.panels.forEach(p => p.classList.remove('active'));
      if (tabName === 'settings') {
        elements.panelSettings.classList.add('active');
      } else {
        const panel = document.getElementById(`panel-${tabName}`);
        if (panel) panel.classList.add('active');
      }
    });
  });
}

// Sniffer Functions
function renderSnifferList(): void {
  if (snifferList.length === 0) {
    elements.snifferList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p>No streams detected</p>
        <span>Visit a page with video content</span>
      </div>
    `;
    elements.snifferCount.textContent = '0';
    return;
  }

  elements.snifferList.innerHTML = '';
  snifferList.forEach(resource => {
    const item = createSnifferItem(resource);
    elements.snifferList.appendChild(item);
  });
  elements.snifferCount.textContent = snifferList.length.toString();
}

function createSnifferItem(resource: StreamResource): HTMLDivElement {
  const template = snifferItemTemplate.content.cloneNode(true) as DocumentFragment;
  const item = template.querySelector('.sniffer-item') as HTMLDivElement;

  item.dataset.id = resource.id;
  item.querySelector('.resource-name')!.textContent = resource.name;
  item.querySelector('.resource-size')!.textContent = formatSize(resource.size);
  item.querySelector('.resource-type')!.textContent = resource.type.toUpperCase();
  (item.querySelector('.resource-url') as HTMLSpanElement)!.textContent = resource.url;

  const downloadBtn = item.querySelector('.btn-download')!;
  const previewBtn = item.querySelector('.btn-preview')!;

  downloadBtn.addEventListener('click', () => startDownload(resource));
  previewBtn.addEventListener('click', () => previewResource(resource));

  return item;
}

function startDownload(resource: StreamResource): void {
  chrome.runtime.sendMessage({
    type: 'START_DOWNLOAD',
    payload: {
      resourceId: resource.id,
      name: resource.name,
      url: resource.url,
      type: resource.type
    }
  });

  showToast(`Starting download: ${resource.name}`);
  switchToTab('downloads');
}

function previewResource(resource: StreamResource): void {
  currentPreview = resource;

  // Update preview container
  elements.previewContainer.innerHTML = `
    <video controls autoplay>
      <source src="${resource.url}" type="application/x-mpegURL">
    </video>
  `;

  // Update video info
  elements.videoInfo.classList.remove('hidden');
  (document.getElementById('video-resolution') as HTMLSpanElement)!.textContent =
    resource.resolution || 'Unknown';
  (document.getElementById('video-duration') as HTMLSpanElement)!.textContent =
    resource.duration || 'Unknown';
  (document.getElementById('video-size') as HTMLSpanElement)!.textContent =
    formatSize(resource.size);

  // Update audio tracks
  if (resource.audioTracks && resource.audioTracks.length > 0) {
    elements.audioSelect.innerHTML = '<option value="best">Best</option>';
    resource.audioTracks.forEach(track => {
      const option = document.createElement('option');
      option.value = track;
      option.textContent = track;
      elements.audioSelect.appendChild(option);
    });
  }

  switchToTab('preview');
}

// Download Functions
function renderDownloadList(): void {
  const activeDownloads = downloadList.filter(d =>
    d.status === 'downloading' || d.status === 'paused' || d.status === 'pending'
  );

  if (downloadList.length === 0) {
    elements.downloadList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <p>No active downloads</p>
        <span>Start downloading a stream</span>
      </div>
    `;
    elements.downloadCount.textContent = '0';
    return;
  }

  elements.downloadList.innerHTML = '';
  downloadList.forEach(task => {
    const item = createDownloadItem(task);
    elements.downloadList.appendChild(item);
  });

  elements.downloadCount.textContent = activeDownloads.length.toString();
}

function createDownloadItem(task: DownloadTask): HTMLDivElement {
  const template = downloadItemTemplate.content.cloneNode(true) as DocumentFragment;
  const item = template.querySelector('.download-item') as HTMLDivElement;

  item.dataset.id = task.id;
  item.querySelector('.resource-name')!.textContent = task.name;

  const progressBar = item.querySelector('.progress-bar') as SVGCircleElement;
  const progressText = item.querySelector('.progress-text') as HTMLSpanElement;
  const progress = task.progress / 100;
  progressBar.style.strokeDashoffset = String(100 - progress * 100);
  progressText.textContent = `${task.progress}%`;

  const statusEl = item.querySelector('.download-status') as HTMLSpanElement;
  statusEl.textContent = task.status.charAt(0).toUpperCase() + task.status.slice(1);
  statusEl.className = `download-status ${task.status}`;

  const speedEl = item.querySelector('.download-speed') as HTMLSpanElement;
  speedEl.textContent = `${formatSpeed(task.speed)}`;

  const etaEl = item.querySelector('.download-eta') as HTMLSpanElement;
  etaEl.textContent = task.eta;

  // Update pause button icon based on status
  const pauseBtn = item.querySelector('.btn-pause') as HTMLButtonElement;
  if (task.status === 'paused') {
    pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    `;
    pauseBtn.title = 'Resume';
  } else {
    pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    `;
    pauseBtn.title = 'Pause';
  }

  pauseBtn.addEventListener('click', () => togglePause(task.id));
  item.querySelector('.btn-cancel')!.addEventListener('click', () => cancelDownload(task.id));

  return item;
}

function togglePause(taskId: string): void {
  const task = downloadList.find(t => t.id === taskId);
  if (!task) return;

  const newStatus = task.status === 'paused' ? 'downloading' : 'paused';

  chrome.runtime.sendMessage({
    type: newStatus === 'paused' ? 'PAUSE_DOWNLOAD' : 'RESUME_DOWNLOAD',
    payload: { taskId }
  });
}

function cancelDownload(taskId: string): void {
  chrome.runtime.sendMessage({
    type: 'CANCEL_DOWNLOAD',
    payload: { taskId }
  });
  showToast('Download cancelled');
}

// Settings Functions
function initSettings(): void {
  elements.btnSettings.addEventListener('click', () => {
    elements.tabs.forEach(t => t.classList.remove('active'));
    elements.panels.forEach(p => p.classList.remove('active'));
    elements.panelSettings.classList.add('active');
  });

  // Load settings
  loadSettings();

  // Save settings on change
  elements.settingDownloadPath.addEventListener('change', saveSettings);
  elements.settingConcurrency.addEventListener('change', saveSettings);
  elements.settingAutoDecrypt.addEventListener('change', saveSettings);
  elements.settingNotifications.addEventListener('change', saveSettings);
  elements.settingLanguage.addEventListener('change', saveSettings);
}

function loadSettings(): void {
  chrome.storage.local.get(['settings'], (result) => {
    if (result.settings) {
      settings = { ...settings, ...result.settings };
      applySettings();
    }
  });
}

function applySettings(): void {
  elements.settingDownloadPath.value = settings.downloadPath;
  elements.settingConcurrency.value = settings.concurrency.toString();
  elements.settingAutoDecrypt.checked = settings.autoDecrypt;
  elements.settingNotifications.checked = settings.notifications;
  elements.settingLanguage.value = settings.language;
}

function saveSettings(): void {
  settings = {
    downloadPath: elements.settingDownloadPath.value,
    concurrency: parseInt(elements.settingConcurrency.value) || 6,
    autoDecrypt: elements.settingAutoDecrypt.checked,
    notifications: elements.settingNotifications.checked,
    language: elements.settingLanguage.value
  };

  chrome.storage.local.set({ settings });
  showToast('Settings saved');
}

// Message Handling
function initMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'SNIFFER_LIST_UPDATE':
        snifferList = message.data;
        renderSnifferList();
        break;

      case 'DOWNLOAD_LIST_UPDATE':
        downloadList = message.data;
        renderDownloadList();
        break;

      case 'DOWNLOAD_PROGRESS_UPDATE':
        updateDownloadProgress(message.data);
        break;

      case 'SPEED_UPDATE':
        updateSpeedDisplay(message.data);
        break;

      case 'TOAST':
        showToast(message.message, message.variant);
        break;

      case 'RECORDING_STATE':
        updateRecordingState(message.isRecording);
        break;

      case 'RECORDING_STATE_UPDATE':
        if (message.data) {
          recordingState.isRecording = message.data.status === 'recording';
          recordingState.sessionId = message.data.id;
          recordingState.resourceId = message.data.resource.id;
          updateRecordingUI();
        }
        break;

      case 'RECORDING_PROGRESS_UPDATE':
        if (message.data) {
          recordingState.duration = message.data.duration;
          recordingState.totalBytes = message.data.totalBytes;
          recordingState.speed = message.data.speed;
          updateRecordingProgress(message.data);
        }
        break;
    }
    sendResponse({ success: true });
    return true;
  });
}

function updateDownloadProgress(data: { taskId: string; progress: number; speed: number; eta: string }): void {
  const task = downloadList.find(t => t.id === data.taskId);
  if (task) {
    task.progress = data.progress;
    task.speed = data.speed;
    task.eta = data.eta;
    renderDownloadList();
  }
}

function updateSpeedDisplay(speed: number): void {
  if (speed > 0) {
    elements.speedDisplay.classList.remove('hidden');
    elements.downloadSpeed.textContent = formatSpeed(speed);
  } else {
    elements.speedDisplay.classList.add('hidden');
  }
}

function updateRecordingState(isRecording: boolean): void {
  recordingState.isRecording = isRecording;
  updateRecordingUI();
}

function updateRecordingUI(): void {
  const btn = elements.btnStartRecording;
  if (recordingState.isRecording) {
    btn.classList.add('recording');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
      </svg>
      <span>Stop</span>
    `;
    btn.disabled = false;
    elements.statusText.textContent = `Recording: ${formatDuration(recordingState.duration)}`;
  } else {
    btn.classList.remove('recording');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="3" fill="currentColor"/>
      </svg>
      <span>Record</span>
    `;
    elements.statusText.textContent = 'Ready';
  }
}

function updateRecordingProgress(data: { duration: number; totalBytes: number; speed: number }): void {
  if (recordingState.isRecording) {
    elements.statusText.textContent = `Recording: ${formatDuration(data.duration)}`;
    if (data.speed > 0) {
      elements.speedDisplay.classList.remove('hidden');
      elements.downloadSpeed.textContent = formatSpeed(data.speed);
    }
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Utility Functions
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return formatSize(bytesPerSecond) + '/s';
}

function switchToTab(tabName: string): void {
  elements.tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  elements.panels.forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
  elements.panelSettings.classList.remove('active');
}

function showToast(message: string, variant: 'success' | 'error' | 'info' = 'info'): void {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${variant}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// Button Actions
function initButtonActions(): void {
  elements.btnClearSniffer.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_SNIFFER_LIST' });
    snifferList = [];
    renderSnifferList();
  });

  elements.btnRefreshSniffer.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REFRESH_SNIFFER_LIST' });
    showToast('Refreshing...');
  });

  elements.btnClearCompleted.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_COMPLETED_DOWNLOADS' });
    downloadList = downloadList.filter(d => d.status !== 'completed');
    renderDownloadList();
  });

  elements.btnStartRecording.addEventListener('click', () => {
    if (recordingState.isRecording) {
      chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
        payload: { resourceId: recordingState.resourceId }
      });
    } else if (snifferList.length > 0) {
      // Start recording the first available stream
      const resource = snifferList[0];
      chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        payload: { resource }
      });
    }
  });

  elements.btnSidepanel.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
  });
}

// Initialize
function init(): void {
  initTabs();
  initSettings();
  initMessageHandler();
  initButtonActions();

  // Request initial data
  chrome.runtime.sendMessage({ type: 'GET_SNIFFER_LIST' });
  chrome.runtime.sendMessage({ type: 'GET_DOWNLOAD_LIST' });
  chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });

  renderSnifferList();
  renderDownloadList();
}

// Run
document.addEventListener('DOMContentLoaded', init);

export { StreamResource, DownloadTask, Settings };
