import type {
  MPDDocument,
  Period,
  AdaptationSet,
  Representation,
  SegmentTemplate,
  SegmentList,
  Segment,
  SegmentTimeline,
  TimelineSegment,
} from "../../shared/types/mpd";
import {
  replaceNumberTemplate,
  parseSegmentTimeline,
  buildInitSegmentUrl,
  buildSegmentUrl,
  calculateSegmentCount,
} from "./dash-utils";

export class MPDParser {
  private parser: DOMParser;
  private xmlDoc: Document | null = null;
  private mpdDocument: MPDDocument | null = null;

  constructor() {
    this.parser = new DOMParser();
  }

  parse(mpdContent: string): MPDDocument {
    this.xmlDoc = this.parser.parseFromString(mpdContent, "application/xml");

    if (this.xmlDoc.querySelector("parsererror")) {
      throw new Error("Invalid MPD XML: parsing error detected");
    }

    const mpdElement = this.xmlDoc.querySelector("MPD");
    if (!mpdElement) {
      throw new Error("Invalid MPD XML: MPD element not found");
    }

    this.mpdDocument = this.extractMPDDocument(mpdElement);
    return this.mpdDocument;
  }

  private extractMPDDocument(mpdElement: Element): MPDDocument {
    const periods: Period[] = [];

    const periodElements = mpdElement.querySelectorAll("Period");
    periodElements.forEach((periodEl) => {
      periods.push(this.extractPeriod(periodEl));
    });

    return {
      type: mpdElement.getAttribute("type") || "static",
      profiles: mpdElement.getAttribute("profiles") || "",
      mediaPresentationDuration: mpdElement.getAttribute(
        "mediaPresentationDuration"
      ) || "",
      minBufferTime: mpdElement.getAttribute("minBufferTime") || "",
      xmlns: mpdElement.getAttribute("xmlns") || "",
      periods,
    };
  }

  private extractPeriod(periodElement: Element): Period {
    const adaptationSets: AdaptationSet[] = [];

    const adaptationSetElements = periodElement.querySelectorAll(
      "AdaptationSet, AdaptationSetRep"
    );
    adaptationSetElements.forEach((asEl) => {
      adaptationSets.push(this.extractAdaptationSet(asEl as Element));
    });

    return {
      id: periodElement.getAttribute("id") || undefined,
      start: periodElement.getAttribute("start") || "PT0S",
      duration: periodElement.getAttribute("duration") || undefined,
      adaptationSets,
    };
  }

  private extractAdaptationSet(asElement: Element): AdaptationSet {
    const representations: Representation[] = [];
    let segmentTemplate: SegmentTemplate | undefined;
    let segmentList: SegmentList | undefined;

    const templateEl = asElement.querySelector("SegmentTemplate");
    if (templateEl) {
      segmentTemplate = this.extractSegmentTemplate(templateEl as Element);
    }

    const listEl = asElement.querySelector("SegmentList");
    if (listEl) {
      segmentList = this.extractSegmentList(listEl as Element);
    }

    const representationElements = asElement.querySelectorAll("Representation");
    representationElements.forEach((repEl) => {
      representations.push(
        this.extractRepresentation(repEl as Element, segmentTemplate, segmentList)
      );
    });

    if (representations.length === 0) {
      const repFromAs = this.extractRepresentationFromAdaptationSet(asElement);
      if (repFromAs) {
        representations.push(repFromAs);
      }
    }

    return {
      id: asElement.getAttribute("id") || undefined,
      mimeType: asElement.getAttribute("mimeType") || "",
      contentType: asElement.getAttribute("contentType") || undefined,
      codec: asElement.getAttribute("codecs") || undefined,
      bandwidth: asElement.hasAttribute("bandwidth")
        ? parseInt(asElement.getAttribute("bandwidth") || "0", 10)
        : undefined,
      width: asElement.hasAttribute("width")
        ? parseInt(asElement.getAttribute("width") || "0", 10)
        : undefined,
      height: asElement.hasAttribute("height")
        ? parseInt(asElement.getAttribute("height") || "0", 10)
        : undefined,
      frameRate: asElement.getAttribute("frameRate") || undefined,
      segmentAlignment: asElement.getAttribute("segmentAlignment") || undefined,
      startWithSAP: asElement.getAttribute("startWithSAP") || undefined,
      representations,
      segmentTemplate,
      segmentList,
    };
  }

  private extractRepresentation(
    repElement: Element,
    inheritedTemplate?: SegmentTemplate,
    inheritedList?: SegmentList
  ): Representation {
    const baseURLs: string[] = [];
    const baseURLElement = repElement.querySelector("BaseURL");
    if (baseURLElement) {
      baseURLs.push(baseURLElement.textContent || "");
    }

    let segmentTemplate = inheritedTemplate;
    let segmentList = inheritedList;

    const templateEl = repElement.querySelector(":scope SegmentTemplate");
    if (templateEl) {
      segmentTemplate = this.extractSegmentTemplate(templateEl as Element);
    }

    const listEl = repElement.querySelector(":scope SegmentList");
    if (listEl) {
      segmentList = this.extractSegmentList(listEl as Element);
    }

    return {
      id: repElement.getAttribute("id") || "",
      bandwidth: repElement.hasAttribute("bandwidth")
        ? parseInt(repElement.getAttribute("bandwidth") || "0", 10)
        : 0,
      width: repElement.hasAttribute("width")
        ? parseInt(repElement.getAttribute("width") || "0", 10)
        : undefined,
      height: repElement.hasAttribute("height")
        ? parseInt(repElement.getAttribute("height") || "0", 10)
        : undefined,
      frameRate: repElement.getAttribute("frameRate") || undefined,
      codec: repElement.getAttribute("codecs") || undefined,
      audioSamplingRate: repElement.getAttribute("audioSamplingRate") || undefined,
      baseURLs,
      segmentTemplate,
      segmentList,
    };
  }

  private extractRepresentationFromAdaptationSet(
    asElement: Element
  ): Representation | null {
    return {
      id: asElement.getAttribute("id") || "0",
      bandwidth: asElement.hasAttribute("bandwidth")
        ? parseInt(asElement.getAttribute("bandwidth") || "0", 10)
        : 0,
      width: asElement.hasAttribute("width")
        ? parseInt(asElement.getAttribute("width") || "0", 10)
        : undefined,
      height: asElement.hasAttribute("height")
        ? parseInt(asElement.getAttribute("height") || "0", 10)
        : undefined,
      frameRate: asElement.getAttribute("frameRate") || undefined,
      codec: asElement.getAttribute("codecs") || undefined,
      audioSamplingRate: undefined,
      baseURLs: [],
      segmentTemplate: undefined,
      segmentList: undefined,
    };
  }

  private extractSegmentTemplate(templateElement: Element): SegmentTemplate {
    return {
      initialization: templateElement.getAttribute("initialization") || undefined,
      media: templateElement.getAttribute("media") || "",
      duration: templateElement.getAttribute("duration") || undefined,
      startNumber: templateElement.getAttribute("startNumber") || undefined,
      timescale: templateElement.getAttribute("timescale") || undefined,
      presentationTimeOffset:
        templateElement.getAttribute("presentationTimeOffset") || undefined,
      indexRange: templateElement.getAttribute("indexRange") || undefined,
      indexRangeExact:
        templateElement.getAttribute("indexRangeExact") === "true",
      initializationRange:
        templateElement.getAttribute("initializationRange") || undefined,
      mediaRange: templateElement.getAttribute("mediaRange") || undefined,
    };
  }

  private extractSegmentList(listElement: Element): SegmentList {
    const segments: Segment[] = [];
    let initialization: string | undefined;

    const initEl = listElement.querySelector("Initialization");
    if (initEl) {
      initialization = initEl.getAttribute("sourceURL") || undefined;
    }

    const segmentElements = listElement.querySelectorAll("SegmentURL");
    segmentElements.forEach((segEl, index) => {
      segments.push({
        index,
        url: segEl.getAttribute("media") || "",
        duration: segEl.getAttribute("duration") || undefined,
        mediaRange: segEl.getAttribute("mediaRange") || undefined,
        initializationRange:
          segEl.getAttribute("initializationRange") || undefined,
      });
    });

    return { initialization, segments };
  }

  getSegmentsForRepresentation(
    representation: Representation,
    adaptationSet: AdaptationSet
  ): Segment[] {
    const template = representation.segmentTemplate || adaptationSet.segmentTemplate;
    const list = representation.segmentList || adaptationSet.segmentList;

    if (list) {
      return list.segments.map((seg, idx) => ({
        ...seg,
        index: idx,
        url: seg.url,
      }));
    }

    if (template) {
      return this.generateSegmentsFromTemplate(representation, adaptationSet, template);
    }

    return [];
  }

  private generateSegmentsFromTemplate(
    representation: Representation,
    adaptationSet: AdaptationSet,
    template: SegmentTemplate
  ): Segment[] {
    const timescale = template.timescale ? parseInt(template.timescale, 10) : 1;
    const startNumber = template.startNumber
      ? parseInt(template.startNumber, 10)
      : 1;

    const timelineEl = this.xmlDoc?.querySelector("SegmentTimeline");
    if (timelineEl) {
      return this.generateSegmentsFromTimeline(
        timelineEl,
        template,
        representation,
        startNumber,
        timescale
      );
    }

    const mpdDuration = this.mpdDocument?.mediaPresentationDuration;
    if (!mpdDuration) {
      return [];
    }

    const durationSec = this.parseDuration(mpdDuration);
    const segmentDuration = template.duration
      ? parseInt(template.duration, 10) / timescale
      : 0;

    if (segmentDuration === 0) {
      return [];
    }

    const segmentCount = Math.ceil(durationSec / segmentDuration);
    const segments: Segment[] = [];

    const baseUrl = representation.baseURLs[0] || "";

    for (let i = 0; i < segmentCount; i++) {
      const number = startNumber + i;
      const url = buildSegmentUrl(
        template,
        { number },
        representation.id,
        representation.bandwidth
      );

      segments.push({
        index: i,
        url: baseUrl + url,
        duration: String(segmentDuration),
      });
    }

    return segments;
  }

  private generateSegmentsFromTimeline(
    timelineEl: Element,
    template: SegmentTemplate,
    representation: Representation,
    startNumber: number,
    timescale: number
  ): Segment[] {
    const timeline = this.extractSegmentTimeline(timelineEl);
    const parsed = parseSegmentTimeline(timescale, startNumber, timeline.segments);
    const segments: Segment[] = [];

    const baseUrl = representation.baseURLs[0] || "";

    for (const seg of parsed) {
      const url = buildSegmentUrl(
        template,
        { number: seg.number, time: seg.time },
        representation.id,
        representation.bandwidth
      );

      segments.push({
        index: seg.number - startNumber,
        url: baseUrl + url,
        duration: String(seg.duration),
      });
    }

    return segments;
  }

  private extractSegmentTimeline(timelineEl: Element): SegmentTimeline {
    const timescale = timelineEl.getAttribute("timescale")
      ? parseInt(timelineEl.getAttribute("timescale") || "1", 10)
      : 1;
    const startNumber = timelineEl.getAttribute("startNumber")
      ? parseInt(timelineEl.getAttribute("startNumber") || "1", 10)
      : 1;

    const segments: TimelineSegment[] = [];
    const sElements = timelineEl.querySelectorAll("S");

    sElements.forEach((sEl) => {
      const startTime = sEl.hasAttribute("t")
        ? parseInt(sEl.getAttribute("t") || "0", 10)
        : 0;
      const duration = sEl.hasAttribute("d")
        ? parseInt(sEl.getAttribute("d") || "0", 10)
        : 0;
      const repeatCount = sEl.hasAttribute("r")
        ? parseInt(sEl.getAttribute("r") || "0", 10)
        : 0;

      segments.push({ startTime, duration, repeatCount });
    });

    return { timescale, startNumber, segments };
  }

  private parseDuration(duration: string): number {
    const match = duration.match(
      /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/
    );
    if (!match) return 0;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseFloat(match[3] || "0");

    return hours * 3600 + minutes * 60 + seconds;
  }

  getInitSegmentUrl(representation: Representation, adaptationSet: AdaptationSet): string {
    const template = representation.segmentTemplate || adaptationSet.segmentTemplate;

    if (!template) {
      return "";
    }

    const initUrl = buildInitSegmentUrl(template, representation.id);
    const baseUrl = representation.baseURLs[0] || "";

    return baseUrl + initUrl;
  }

  getDocument(): MPDDocument | null {
    return this.mpdDocument;
  }

  static isSupported(mpdContent: string): boolean {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(mpdContent, "application/xml");
      return doc.querySelector("MPD") !== null;
    } catch {
      return false;
    }
  }
}
