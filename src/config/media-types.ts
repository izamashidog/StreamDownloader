export const MEDIA_TYPES = {
  M3U8: {
    extensions: ['.m3u8'] as string[],
    contentTypes: [
      'application/vnd.apple.mpegurl',
      'application/x-mpegURL',
      'audio/mpegurl',
      'application/x-mpegurl',
      'application/x-m3u8',
      'application/m3u8',
      'application/x-hls'
    ],
    type: 'm3u8' as const
  },
  MPD: {
    extensions: ['.mpd'] as string[],
    contentTypes: [
      'application/dash+xml',
      'application/xml',
      'text/xml',
      'application/dash-xml',
      'application/vnd.ms-sstr+xml'
    ],
    type: 'mpd' as const
  }
} as const;

export const VIDEO_EXTENSIONS = ['.ts', '.m4s', '.mp4', '.webm', '.mkv'];
export const AUDIO_EXTENSIONS = ['.aac', '.mp3', '.ogg', '.wav', '.flac'];

export const DECLARATIVE_NET_REQUEST_RULES = [
  {
    id: 1,
    priority: 1,
    action: { type: 'allow' },
    condition: {
      urlFilter: '|*',
      resourceTypes: ['media', 'fetch']
    }
  }
];
