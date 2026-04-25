import type {
  SegmentTemplate,
  Segment,
  SegmentTimeline,
  TimelineSegment,
} from "../../shared/types/mpd";

export function replaceNumberTemplate(
  template: string,
  number: number,
  bandwidth?: number
): string {
  let result = template;
  result = result.replace(/\$Number\$/g, String(number));
  result = result.replace(/\$Number\%0\d+d\$/g, (match) => {
    const padding = parseInt(match.match(/\$Number\%0(\d)d\$/)?.[1] || "6", 10);
    return String(number).padStart(padding, "0");
  });
  if (bandwidth !== undefined) {
    result = result.replace(/\$Bandwidth\$/g, String(bandwidth));
  }
  return result;
}

export function replaceTimeTemplate(template: string, time: number): string {
  return template.replace(/\$Time\$/g, String(time));
}

export function parseSegmentTimeline(
  timescale: number,
  startNumber: number,
  segments: TimelineSegment[]
): { number: number; time: number; duration: number }[] {
  const result: { number: number; time: number; duration: number }[] = [];
  let currentNumber = startNumber;
  let currentTime = 0;

  for (const segment of segments) {
    const duration = segment.duration / timescale;
    const repeatCount = segment.repeatCount ?? 0;

    for (let i = 0; i <= repeatCount; i++) {
      result.push({
        number: currentNumber++,
        time: currentTime,
        duration,
      });
      currentTime += duration;
    }
  }

  return result;
}

export function calculateSegmentCount(
  template: SegmentTemplate,
  duration: string,
  timescale: number
): number {
  const durationSec = parseFloat(duration);
  const templateDuration = template.duration
    ? parseInt(template.duration, 10) / timescale
    : 0;

  if (templateDuration > 0) {
    return Math.ceil(durationSec / templateDuration);
  }

  return 0;
}

export function buildInitSegmentUrl(
  template: SegmentTemplate,
  representationId?: string
): string {
  let url = template.initialization || "";

  if (representationId) {
    url = url.replace(/\$RepresentationID\$/g, representationId);
  }

  return url;
}

export function buildSegmentUrl(
  template: SegmentTemplate,
  segment: { number?: number; time?: number },
  representationId?: string,
  bandwidth?: number
): string {
  let url = template.media;

  if (representationId) {
    url = url.replace(/\$RepresentationID\$/g, representationId);
  }

  if (segment.number !== undefined) {
    url = replaceNumberTemplate(url, segment.number, bandwidth);
  }

  if (segment.time !== undefined) {
    url = replaceTimeTemplate(url, segment.time);
  }

  return url;
}

export function parseRangeHeader(rangeHeader: string): {
  start: number;
  end: number;
} | null {
  const match = rangeHeader.match(/bytes=(\d+)-(\d+)/);
  if (!match) return null;

  return {
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
  };
}

export function formatRangeHeader(start: number, end: number): string {
  return `bytes=${start}-${end}`;
}

export function calculateTotalDuration(
  segments: { time: number; duration: number }[]
): number {
  if (segments.length === 0) return 0;

  const lastSegment = segments[segments.length - 1];
  return lastSegment.time + lastSegment.duration;
}
