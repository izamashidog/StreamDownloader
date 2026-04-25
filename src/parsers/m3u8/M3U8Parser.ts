/**
 * M3U8Parser - HTTP Live Streaming Playlist Parser
 * RFC 8216 compliant parser for Master and Media Playlists
 */

import type {
  M3U8Playlist,
  VariantStream,
  TSSegment,
  EncryptionKey,
  AudioGroup,
  SubtitleGroup,
  ParseOptions,
  ByteRange,
} from '../../shared/types/m3u8';

interface ParserState {
  version: number;
  type: 'master' | 'media' | null;
  targetDuration: number;
  mediaSequence: number;
  discontinuitySequence: number;
  segments: TSSegment[];
  variantStreams: VariantStream[];
  currentVariant: Partial<VariantStream>;
  currentSegment: Partial<TSSegment>;
  encryption: EncryptionKey;
  mediaGroups: M3U8Playlist['mediaGroups'];
  startTime: number | undefined;
  independentSegments: boolean;
  lineBuffer: string[];
}

export class M3U8Parser {
  private options: Required<ParseOptions>;
  private baseUrl: string;

  constructor(options: ParseOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl || '',
      enableCrypto: options.enableCrypto ?? true,
      selectedBandwidth: options.selectedBandwidth || 0,
      preferAvc: options.preferAvc ?? true,
    };
    this.baseUrl = this.options.baseUrl;
  }

  /**
   * Parse M3U8 content string
   */
  parse(content: string, baseUrl?: string): M3U8Playlist {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
    return this.parseLines(this.tokenize(content));
  }

  /**
   * Tokenize M3U8 content into lines
   */
  private tokenize(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === '') {
        i++;
        continue;
      }
      if (line.startsWith('#EXT')) {
        result.push(line);
      } else if (line.startsWith('/') || line.startsWith('http')) {
        result.push(line);
      } else if (line.trim()) {
        result.push(line.trim());
      }
      i++;
    }
    return result;
  }

  /**
   * Parse tokenized lines into playlist structure
   */
  private parseLines(lines: string[]): M3U8Playlist {
    const state = this.createInitialState();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXTM3U')) {
        continue;
      } else if (line.startsWith('#EXT-X-VERSION')) {
        state.version = this.parseInt(line, '#EXT-X-VERSION:');
      } else if (line.startsWith('#EXT-X-TARGETDURATION')) {
        state.targetDuration = this.parseInt(line, '#EXT-X-TARGETDURATION:');
      } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
        state.mediaSequence = this.parseInt(line, '#EXT-X-MEDIA-SEQUENCE:');
      } else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE')) {
        state.discontinuitySequence = this.parseInt(line, '#EXT-X-DISCONTINUITY-SEQUENCE:');
      } else if (line.startsWith('#EXT-X-START')) {
        state.startTime = this.parseStartTime(line);
      } else if (line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) {
        state.independentSegments = true;
      } else if (line.startsWith('#EXT-X-PLAYLIST-TYPE')) {
        // Only in Media Playlists
      } else if (line.startsWith('#EXT-X-KEY')) {
        this.parseEncryptionKey(line, state);
      } else if (line.startsWith('#EXT-X-MAP')) {
        this.parseMap(line, state);
      } else if (line.startsWith('#EXTINF')) {
        this.parseExtInf(line, state);
      } else if (line.startsWith('#EXT-X-BYTE-RANGE')) {
        this.parseByteRange(line, state);
      } else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        this.setDiscontinuity(state);
      } else if (line.startsWith('#EXT-X-STREAM-INF')) {
        this.parseStreamInf(line, state);
      } else if (line.startsWith('#EXT-X-MEDIA')) {
        this.parseMedia(line, state);
      } else if (line.startsWith('#EXT-X-RENDITION-REPORT')) {
        // Skip for now
      } else if (!line.startsWith('#')) {
        this.parseSegmentUrl(line, state);
      }
    }

    return this.buildPlaylist(state);
  }

  private createInitialState(): ParserState {
    return {
      version: 3,
      type: null,
      targetDuration: 0,
      mediaSequence: 0,
      discontinuitySequence: 0,
      segments: [],
      variantStreams: [],
      currentVariant: {},
      currentSegment: {},
      encryption: {
        method: 'NONE',
        key: null,
        iv: null,
        keyformat: null,
        keyformatversions: null,
      },
      mediaGroups: undefined,
      startTime: undefined,
      independentSegments: false,
      lineBuffer: [],
    };
  }

  private parseInt(line: string, prefix: string): number {
    return parseInt(line.substring(prefix.length), 10);
  }

  private parseFloat(line: string, prefix: string): number {
    return parseFloat(line.substring(prefix.length));
  }

  private parseStartTime(line: string): number {
    const parts = line.substring('#EXT-X-START:'.length).split(',');
    const timeOffset = parts.find(p => p.trim().startsWith('TIME-OFFSET='));
    if (timeOffset) {
      return parseFloat(timeOffset.split('=')[1]);
    }
    return 0;
  }

  private parseEncryptionKey(line: string, state: ParserState): void {
    const attrs = this.parseAttributes(line.substring('#EXT-X-KEY:'.length));
    state.encryption = {
      method: (attrs['METHOD'] as EncryptionKey['method']) || 'NONE',
      key: attrs['URI'] ? this.stripQuotes(this.toString(attrs['URI'])) : null,
      iv: attrs['IV'] ? this.stripQuotes(this.toString(attrs['IV'])) : null,
      keyformat: attrs['KEYFORMAT'] ? this.stripQuotes(this.toString(attrs['KEYFORMAT'])) : null,
      keyformatversions: attrs['KEYFORMATVERSIONS']
        ? this.stripQuotes(this.toString(attrs['KEYFORMATVERSIONS']))
        : null,
    };
  }

  private parseMap(line: string, state: ParserState): void {
    const attrs = this.parseAttributes(line.substring('#EXT-X-MAP:'.length));
    const uri = this.toString(attrs['URI']);
    if (uri) {
      const mapUrl = this.resolveUrl(this.stripQuotes(uri));
      if (state.currentSegment) {
        state.currentSegment.mapUrl = mapUrl;
      }
    }
  }

  private parseExtInf(line: string, state: ParserState): void {
    const parts = line.substring('#EXTINF:'.length).split(',');
    const duration = parseFloat(parts[0]);
    const title = parts.length > 1 ? parts[1] : '';

    state.currentSegment = {
      seqId: state.segments.length,
      url: '',
      duration,
      title,
      discontinuity: false,
      encryption: { ...state.encryption },
    };
  }

  private parseByteRange(line: string, state: ParserState): void {
    const value = line.substring('#EXT-X-BYTE-RANGE:'.length);
    const parts = value.split('@');
    const length = parseInt(parts[0], 10);
    const offset = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    state.currentSegment.byteRange = { length, offset };
  }

  private setDiscontinuity(state: ParserState): void {
    if (state.currentSegment) {
      state.currentSegment.discontinuity = true;
    }
    state.discontinuitySequence++;
  }

  private parseStreamInf(line: string, state: ParserState): void {
    if (state.currentVariant.segments) {
      this.finalizeVariant(state);
    }

    const attrs = this.parseAttributes(line.substring('#EXT-X-STREAM-INF:'.length));
    state.currentVariant = {
      bandwidth: parseInt(attrs['BANDWIDTH'] as string, 10),
      averageBandwidth: attrs['AVERAGE-BANDWIDTH']
        ? parseInt(attrs['AVERAGE-BANDWIDTH'] as string, 10)
        : undefined,
      codec: (attrs['CODECS'] as string) || '',
      resolution: attrs['RESOLUTION']
        ? this.parseResolution(attrs['RESOLUTION'] as string)
        : undefined,
      frameRate: attrs['FRAME-RATE']
        ? parseFloat(attrs['FRAME-RATE'] as string)
        : undefined,
      video: attrs['VIDEO'] ? this.stripQuotes(attrs['VIDEO'] as string) : undefined,
      audio: attrs['AUDIO'] ? this.stripQuotes(attrs['AUDIO'] as string) : undefined,
      subtitles: attrs['SUBTITLES']
        ? this.stripQuotes(attrs['SUBTITLES'] as string)
        : undefined,
      closedCaptions: attrs['CLOSED-CAPTIONS']
        ? this.stripQuotes(attrs['CLOSED-CAPTIONS'] as string)
        : undefined,
      segments: [],
      targetDuration: 0,
      mediaSequence: 0,
      discontinuitySequence: 0,
      endList: false,
    };
    state.type = 'master';
    state.lineBuffer = [];
  }

  private parseMedia(line: string, state: ParserState): void {
    if (!state.mediaGroups) {
      state.mediaGroups = {
        AUDIO: {},
        VIDEO: {},
        SUBTITLES: {},
        'CLOSED-CAPTIONS': {},
      };
    }

    const attrs = this.parseAttributes(line.substring('#EXT-X-MEDIA:'.length));
    const type = (attrs['TYPE'] as string || '').toUpperCase();
    const groupId = attrs['GROUP-ID'] ? this.stripQuotes(attrs['GROUP-ID'] as string) : '';
    const name = attrs['NAME'] ? this.stripQuotes(attrs['NAME'] as string) : '';

    const group: AudioGroup | SubtitleGroup = {
      groupId,
      name,
      autoselect: attrs['AUTOSELECT'] === 'YES',
      default: attrs['DEFAULT'] === 'YES',
      forced: attrs['FORCED'] === 'YES',
      urls: attrs['URI'] ? [this.resolveUrl(this.stripQuotes(attrs['URI'] as string))] : [],
    };

    if (type === 'AUDIO' && groupId && name) {
      state.mediaGroups.AUDIO[groupId] = group as AudioGroup;
    } else if (type === 'SUBTITLES' && groupId && name) {
      state.mediaGroups.SUBTITLES[groupId] = group as SubtitleGroup;
    }
  }

  private parseSegmentUrl(line: string, state: ParserState): void {
    const url = this.resolveUrl(line);
    const segment = state.currentSegment as TSSegment;

    if (!segment.url) {
      segment.url = url;
      segment.seqId = state.segments.length + state.mediaSequence;

      if (state.currentVariant.segments !== undefined) {
        state.currentVariant.segments.push(segment);
        const targetDuration = state.currentVariant.targetDuration ?? 0;
        if (segment.duration > targetDuration) {
          state.currentVariant.targetDuration = segment.duration;
        }
      } else {
        state.segments.push(segment);
        if (segment.duration > state.targetDuration) {
          state.targetDuration = segment.duration;
        }
      }
    }

    state.currentSegment = {};
  }

  private finalizeVariant(state: ParserState): void {
    if (state.currentVariant.segments && state.currentVariant.segments.length > 0) {
      state.variantStreams.push(state.currentVariant as VariantStream);
    }
  }

  private buildPlaylist(state: ParserState): M3U8Playlist {
    if (state.currentVariant.segments) {
      this.finalizeVariant(state);
    }

    const variantStreams =
      state.variantStreams.length > 0
        ? this.selectBestVariant(state.variantStreams)
        : [{ ...state.currentVariant, segments: state.segments } as VariantStream];

    const allSegments = variantStreams.flatMap(v => v.segments);
    const totalDuration = allSegments.reduce((sum, seg) => sum + seg.duration, 0);

    const endList = allSegments.length > 0 && !allSegments[allSegments.length - 1].url;

    return {
      version: state.version,
      type: state.type || (variantStreams.length > 1 ? 'master' : 'media'),
      targetDuration: state.targetDuration,
      totalDuration,
      variantStreams,
      mediaGroups: state.mediaGroups,
      startTime: state.startTime,
      independentSegments: state.independentSegments,
    };
  }

  private selectBestVariant(variants: VariantStream[]): VariantStream[] {
    if (variants.length === 0) {
      return [];
    }

    if (this.options.selectedBandwidth > 0) {
      const selected = variants.find(
        v => v.bandwidth <= this.options.selectedBandwidth
      );
      if (selected) {
        return [selected];
      }
    }

    const sorted = [...variants].sort((a, b) => {
      if (this.options.preferAvc) {
        const aIsAvc = a.codec.toLowerCase().includes('avc');
        const bIsAvc = b.codec.toLowerCase().includes('avc');
        if (aIsAvc && !bIsAvc) return -1;
        if (!aIsAvc && bIsAvc) return 1;
      }
      return b.bandwidth - a.bandwidth;
    });

    return [sorted[0]];
  }

  private resolveUrl(url: string): string {
    if (!url) {
      return '';
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return 'https:' + url;
    }

    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const urlPath = url.startsWith('/') ? url : '/' + url;

    return base + urlPath;
  }

  private parseResolution(res: string): { width: number; height: number } {
    const parts = res.split('x');
    return {
      width: parseInt(parts[0], 10),
      height: parseInt(parts[1], 10),
    };
  }

  private stripQuotes(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  private toString(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
  }

  private parseAttributes(attrString: string): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    const regex = /([A-Z-]+)=("([^"]|\\")*"|'([^']|\\')*'|[^,\s]+)/g;
    let match;

    while ((match = regex.exec(attrString)) !== null) {
      const key = match[1];
      let value = match[2];

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (value.includes(',')) {
        result[key] = value.split(',');
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
