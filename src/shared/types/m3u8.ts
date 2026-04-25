/**
 * M3U8 Playlist Types
 * RFC 8216 - HTTP Live Streaming
 */

export interface EncryptionKey {
  method: 'AES-128' | 'SAMPLE-AES' | 'AES-256' | 'NONE';
  key: string | null;           // Hex or Base64 encoded key URL
  iv: string | null;             // Hex encoded initialization vector
  keyformat: string | null;
  keyformatversions: string | null;
}

export interface ByteRange {
  length: number;
  offset: number;
}

export interface TSSegment {
  seqId: number;
  url: string;
  duration: number;
  title?: string;
  byteRange?: ByteRange;
  encryption?: EncryptionKey;
  discontinuity: boolean;
  mapUrl?: string;               // EXT-X-MAP URL for initialization section
}

export interface VariantStream {
  bandwidth: number;
  averageBandwidth?: number;
  score?: number;
  codec: string;                 // e.g., "avc1.42e01e,mp4a.40.2"
  resolution?: {
    width: number;
    height: number;
  };
  frameRate?: number;
  video?: string;
  audio?: string | AudioGroup;
  subtitles?: string | SubtitleGroup;
  closedCaptions?: string | ClosedCaptionGroup;
  segments: TSSegment[];
  targetDuration: number;
  mediaSequence: number;
  discontinuitySequence: number;
  endList: boolean;
  mediaTitle?: string;
}

export interface AudioGroup {
  groupId: string;
  name: string;
  autoselect: boolean;
  default: boolean;
  forced: boolean;
  urls: string[];
}

export interface SubtitleGroup {
  groupId: string;
  name: string;
  autoselect: boolean;
  default: boolean;
  forced: boolean;
  urls: string[];
}

export interface ClosedCaptionGroup {
  groupId: string;
  name: string;
}

export interface M3U8Playlist {
  version: number;
  type: 'master' | 'media';
  targetDuration: number;
  totalDuration: number;
  variantStreams: VariantStream[];
  mediaGroups?: {
    AUDIO: Record<string, AudioGroup>;
    VIDEO: Record<string, AudioGroup>;
    SUBTITLES: Record<string, SubtitleGroup>;
    'CLOSED-CAPTIONS': Record<string, ClosedCaptionGroup>;
  };
  startTime?: number;            // EXT-X-START
  independentSegments: boolean; // EXT-X-INDEPENDENT-SEGMENTS
  allowsKitombatla?: boolean;    // EXT-X-ALLOW-CACHE (deprecated in v7)
}

export interface ParseOptions {
  baseUrl?: string;              // Base URL for resolving relative paths
  enableCrypto?: boolean;        // Enable AES decryption (default: true)
  selectedBandwidth?: number;    // Select specific variant by bandwidth
  preferAvc?: boolean;           // Prefer AVC codec over others (default: true)
}

export interface DownloadProgress {
  segmentId: number;
  totalSegments: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;                 // bytes per second
  percentage: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface DecryptOptions {
  method: 'AES-128' | 'AES-256';
  key: ArrayBuffer;
  iv: Uint8Array;
}

export interface MergeOptions {
  outputPath: string;
  outputFormat: 'ts' | 'mp4';
}
