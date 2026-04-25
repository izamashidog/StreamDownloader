/**
 * LiveRecorder - Live stream recording
 * Note: Full implementation requires M3U8 parser integration
 */

import { chrome } from 'webextension-polyfill';
import type { StreamResource } from '../shared/types';

export interface RecordingSession {
  id: string;
  resource: StreamResource;
  status: 'recording' | 'paused' | 'stopped' | 'error';
  startTime: number;
  duration: number;
  totalBytes: number;
  segmentsDownloaded: number;
  lastSegmentSeq: number;
  outputPath?: string;
  error?: string;
}

export interface RecordingProgress {
  sessionId: string;
  duration: number;
  totalBytes: number;
  segmentsDownloaded: number;
  speed: number;
}

type RecordingEventType = 'started' | 'stopped' | 'progress' | 'error' | 'streamEnded';
type RecordingListener = (event: RecordingEventType, data: RecordingProgress | RecordingSession | string) => void;

interface RecordingConfig {
  refreshInterval: number;
  maxSegmentsInMemory: number;
  mergeInterval: number;
  segmentTimeout: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RecordingConfig = {
  refreshInterval: 2000,
  maxSegmentsInMemory: 100,
  mergeInterval: 5000,
  segmentTimeout: 30000,
  maxRetries: 3,
};

export class LiveRecorder {
  private config: RecordingConfig;
  private sessions: Map<string, RecordingSession> = new Map();
  private listeners: Set<RecordingListener> = new Set();

  constructor(config: Partial<RecordingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  on(callback: RecordingListener): void {
    this.listeners.add(callback);
  }

  off(callback: RecordingListener): void {
    this.listeners.delete(callback);
  }

  private emit(event: RecordingEventType, data: RecordingProgress | RecordingSession | string): void {
    this.listeners.forEach(cb => cb(event, data));
  }

  async startRecording(resource: StreamResource): Promise<RecordingSession> {
    if (this.sessions.has(resource.id)) {
      throw new Error(`Recording already in progress for ${resource.id}`);
    }

    const session: RecordingSession = {
      id: this.generateSessionId(),
      resource,
      status: 'recording',
      startTime: Date.now(),
      duration: 0,
      totalBytes: 0,
      segmentsDownloaded: 0,
      lastSegmentSeq: -1,
    };

    this.sessions.set(resource.id, session);
    this.emit('started', session);
    return session;
  }

  async stopRecording(resourceId: string): Promise<RecordingSession | null> {
    const session = this.sessions.get(resourceId);
    if (!session) return null;

    session.status = 'stopped';
    session.duration = Date.now() - session.startTime;
    this.emit('stopped', session);
    return session;
  }

  async pauseRecording(resourceId: string): Promise<void> {
    const session = this.sessions.get(resourceId);
    if (!session || session.status !== 'recording') return;
    session.status = 'paused';
    this.emit('stopped', session);
  }

  async resumeRecording(resourceId: string): Promise<void> {
    const session = this.sessions.get(resourceId);
    if (!session || session.status !== 'paused') return;
    session.status = 'recording';
    this.emit('started', session);
  }

  getSession(resourceId: string): RecordingSession | null {
    return this.sessions.get(resourceId) || null;
  }

  getAllSessions(): RecordingSession[] {
    return Array.from(this.sessions.values());
  }

  isRecording(resourceId: string): boolean {
    const session = this.sessions.get(resourceId);
    return session?.status === 'recording';
  }

  private generateSessionId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  destroy(): void {
    this.sessions.clear();
    this.listeners.clear();
  }
}

let instance: LiveRecorder | null = null;

export function getLiveRecorder(): LiveRecorder {
  if (!instance) {
    instance = new LiveRecorder();
  }
  return instance;
}

export function resetLiveRecorder(): void {
  instance?.destroy();
  instance = null;
}