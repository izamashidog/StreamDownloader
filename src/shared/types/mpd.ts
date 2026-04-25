export interface MPDDocument {
  type: string;
  profiles: string;
  mediaPresentationDuration: string;
  minBufferTime: string;
  xmlns: string;
  periods: Period[];
}

export interface Period {
  id?: string;
  start: string;
  duration?: string;
  adaptationSets: AdaptationSet[];
}

export interface AdaptationSet {
  id?: string;
  mimeType: string;
  contentType?: string;
  codec?: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  frameRate?: string;
  segmentAlignment?: string;
  startWithSAP?: string;
  representations: Representation[];
  segmentTemplate?: SegmentTemplate;
  segmentList?: SegmentList;
}

export interface Representation {
  id: string;
  bandwidth: number;
  width?: number;
  height?: number;
  frameRate?: string;
  codec?: string;
  audioSamplingRate?: string;
  baseURLs: string[];
  segmentTemplate?: SegmentTemplate;
  segmentList?: SegmentList;
}

export interface SegmentTemplate {
  initialization?: string;
  media: string;
  duration?: string;
  startNumber?: string;
  timescale?: string;
  presentationTimeOffset?: string;
  indexRange?: string;
  indexRangeExact?: boolean;
  initializationRange?: string;
  mediaRange?: string;
}

export interface SegmentList {
  initialization?: string;
  segments: Segment[];
}

export interface Segment {
  index: number;
  url: string;
  duration?: string;
  mediaRange?: string;
  initializationRange?: string;
}

export interface SegmentTimeline {
  timescale: number;
  startNumber: number;
  segments: TimelineSegment[];
}

export interface TimelineSegment {
  startTime: number;
  duration: number;
  repeatCount?: number;
}

export interface M4SDownloadOptions {
  url: string;
  range?: { start: number; end: number };
  signal?: AbortSignal;
  onProgress?: (downloaded: number, total: number) => void;
}

export interface DownloadedSegment {
  index: number;
  data: ArrayBuffer;
  url: string;
}
