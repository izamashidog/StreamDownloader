/**
 * TSMerger - Binary concatenation and MP4 muxing for TS segments
 * Combines TS fragments into final output file
 */

import type { MergeOptions } from '../../shared/types/m3u8';

export class TSMerger {
  private static TS_SYNC_BYTE = 0x47;
  private static PAT_PID = 0x00;
  private static PMT_PID = 0x1000;

  /**
   * Merge TS segments into a single binary buffer
   */
  static merge(segments: ArrayBuffer[], options?: { includeHeaders?: boolean }): ArrayBuffer {
    const includeHeaders = options?.includeHeaders ?? true;

    if (segments.length === 0) {
      return new ArrayBuffer(0);
    }

    if (segments.length === 1) {
      return segments[0];
    }

    const totalLength = segments.reduce((sum, seg) => sum + seg.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const segment of segments) {
      const data = new Uint8Array(segment);

      if (includeHeaders) {
        result.set(data, offset);
        offset += data.length;
      } else {
        const packets = this.splitIntoPackets(data);
        for (const packet of packets) {
          const packetData = this.stripPacketHeaders(packet);
          result.set(packetData, offset);
          offset += packetData.length;
        }
      }
    }

    return result.buffer;
  }

  /**
   * Split data into 188-byte TS packets
   */
  private static splitIntoPackets(data: Uint8Array): Uint8Array[] {
    const packets: Uint8Array[] = [];
    const packetSize = 188;

    for (let i = 0; i + packetSize <= data.length; i += packetSize) {
      const packet = data.slice(i, i + packetSize);
      if (packet[0] === TSMerger.TS_SYNC_BYTE) {
        packets.push(packet);
      }
    }

    return packets;
  }

  /**
   * Strip transport stream headers from packet
   */
  private static stripPacketHeaders(packet: Uint8Array): Uint8Array {
    if (packet.length < 188) {
      return packet;
    }

    let offset = 0;

    const syncByte = packet[offset++];
    if (syncByte !== TSMerger.TS_SYNC_BYTE) {
      return packet;
    }

    const transportErrorIndicator = (packet[offset] >> 7) & 0x01;
    if (transportErrorIndicator) {
      return packet;
    }

    const payloadUnitStartIndicator = (packet[offset] >> 6) & 0x01;
    const transportPriority = (packet[offset] >> 5) & 0x01;
    const PID = ((packet[offset] & 0x1f) << 8) | packet[offset + 1];

    offset += 2;

    const scramblingControl = (packet[offset] >> 6) & 0x03;
    const adaptationFieldExist = (packet[offset] >> 5) & 0x01;
    const payloadExists = (packet[offset] >> 4) & 0x01;

    offset++;

    if (payloadExists && adaptationFieldExist) {
      const adaptationFieldLength = packet[offset++];
      offset += adaptationFieldLength;
    }

    if (payloadExists) {
      if (payloadUnitStartIndicator) {
        const pointerField = packet[offset++];
        offset += pointerField;
      }

      if (PID === TSMerger.PAT_PID || PID === TSMerger.PMT_PID) {
        return packet;
      }

      return packet.slice(offset);
    }

    return new Uint8Array(0);
  }

  /**
   * Create MP4 file from raw PES data
   * This creates a basic MP4 container structure
   */
  static async createMP4(
    videoData: ArrayBuffer,
    options: {
      width?: number;
      height?: number;
      duration?: number;
      timescale?: number;
    } = {}
  ): Promise<ArrayBuffer> {
    const width = options.width || 1920;
    const height = options.height || 1080;
    const duration = options.duration || 0;
    const timescale = options.timescale || 90000;

    const mp4 = new MP4Builder({
      width,
      height,
      duration,
      timescale,
    });

    return mp4.build(videoData);
  }

  /**
   * Simple MP4 container builder
   */
  static buildMP4FromPES(pesData: ArrayBuffer, metadata: {
    width: number;
    height: number;
    duration: number;
  }): ArrayBuffer {
    const { width, height, duration } = metadata;

    const ftyp = this.buildFTYP();
    const moov = this.buildMOOV(width, height, duration);
    const mdat = this.buildMDAT(pesData);

    const totalSize = ftyp.byteLength + moov.byteLength + mdat.byteLength;
    const result = new Uint8Array(totalSize);
    let offset = 0;

    result.set(new Uint8Array(ftyp), offset);
    offset += ftyp.byteLength;

    result.set(new Uint8Array(moov), offset);
    offset += moov.byteLength;

    result.set(new Uint8Array(mdat), offset);

    return result.buffer;
  }

  private static buildFTYP(): ArrayBuffer {
    const brand = new Uint8Array([0x69, 0x73, 0x6f, 0x6d]);
    const minorVersion = new Uint8Array([0x00, 0x00, 0x02, 0x00]);
    const compatibleBrands = new Uint8Array([
      0x69, 0x73, 0x6f, 0x6d,
      0x69, 0x73, 0x6f, 0x32,
      0x61, 0x76, 0x63, 0x31,
      0x6d, 0x70, 0x34, 0x31,
    ]);

    const size = 8 + 8 + compatibleBrands.length;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x66747970);
    view.setUint32(8, 0x69736f6d);
    view.setUint32(12, 0x00000200);
    buffer.set(brand, 8);
    buffer.set(minorVersion, 12);
    buffer.set(compatibleBrands, 16);

    return buffer.buffer;
  }

  private static buildMOOV(width: number, height: number, duration: number): ArrayBuffer {
    const mvhd = this.buildMVHD(duration);
    const trak = this.buildTRAK(width, height, duration);
    const udta = this.buildUDTA();

    const size = 8 + mvhd.byteLength + trak.byteLength + udta.byteLength;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x6d6f6f76);
    buffer.set(new Uint8Array(mvhd), 8);
    buffer.set(new Uint8Array(trak), 8 + mvhd.byteLength);
    buffer.set(new Uint8Array(udta), 8 + mvhd.byteLength + trak.byteLength);

    return buffer.buffer;
  }

  private static buildMVHD(duration: number): ArrayBuffer {
    const data = new ArrayBuffer(100);
    const view = new DataView(data);

    view.setUint32(0, 100);
    view.setUint32(4, 0x6d766864);
    view.setUint8(8, 0);
    view.setUint32(12, 0x00000000);
    view.setUint32(16, 0x00000000);
    view.setUint32(20, 90_000);
    view.setUint32(24, 0x00010000);
    view.setFloat64(28, 1.0);
    view.setFloat64(36, 0.0);
    view.setUint32(44, 0x00010000);
    view.setUint32(48, 0x00000000);
    view.setUint32(52, 0x00000000);
    view.setUint32(56, 0x00000000);
    view.setUint32(60, 0x00010000);
    view.setUint32(64, 0x00000000);
    view.setUint32(68, 0x00000000);
    view.setUint32(72, 0x00000000);
    view.setUint32(76, 0x00010000);
    view.setUint32(80, 0x00000000);
    view.setUint32(84, 0x00000000);
    view.setUint32(88, 0x00000000);
    view.setUint32(92, 0x00000000);
    view.setUint32(96, 0x00000000);

    return data;
  }

  private static buildTRAK(width: number, height: number, duration: number): ArrayBuffer {
    const tkhd = this.buildTKHD(width, height, duration);
    const mdia = this.buildMDIA(width, height, duration);

    const size = 8 + tkhd.byteLength + mdia.byteLength;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x7472616b);
    buffer.set(new Uint8Array(tkhd), 8);
    buffer.set(new Uint8Array(mdia), 8 + tkhd.byteLength);

    return buffer.buffer;
  }

  private static buildTKHD(width: number, height: number, duration: number): ArrayBuffer {
    const data = new ArrayBuffer(92);
    const view = new DataView(data);

    view.setUint32(0, 92);
    view.setUint32(4, 0x746b6864);
    view.setUint8(8, 0);
    view.setUint32(12, 0x00000000);
    view.setUint32(16, 0x00000000);
    view.setUint32(20, 0x00000001);
    view.setUint32(24, 0x00000000);
    view.setUint32(28, 0x00000000);
    view.setUint32(32, duration);
    view.setUint32(36, 0x00010000);
    view.setUint32(40, 0x00000000);
    view.setFloat64(44, 0.0);
    view.setFloat64(52, 0.0);
    view.setUint32(60, 0x00010000);
    view.setUint32(64, 0x00000000);
    view.setUint32(68, 0x00000000);
    view.setUint32(72, 0x00000000);
    view.setUint32(76, 0x00000000);
    view.setUint32(80, 0x00000000);
    view.setUint32(84, width << 16);
    view.setUint32(88, height << 16);

    return data;
  }

  private static buildMDIA(width: number, height: number, duration: number): ArrayBuffer {
    const mdhd = this.buildMDHD(duration);
    const hdlr = this.buildHDLR();
    const minf = this.buildMINF(width, height, duration);

    const size = 8 + mdhd.byteLength + hdlr.byteLength + minf.byteLength;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x6d646961);
    buffer.set(new Uint8Array(mdhd), 8);
    buffer.set(new Uint8Array(hdlr), 8 + mdhd.byteLength);
    buffer.set(new Uint8Array(minf), 8 + mdhd.byteLength + hdlr.byteLength);

    return buffer.buffer;
  }

  private static buildMDHD(duration: number): ArrayBuffer {
    const data = new ArrayBuffer(32);
    const view = new DataView(data);

    view.setUint32(0, 32);
    view.setUint32(4, 0x6d646864);
    view.setUint8(8, 0);
    view.setUint32(12, 0x00000000);
    view.setUint32(16, 90_000);
    view.setUint32(20, duration);
    view.setUint16(24, 0x55c4);
    view.setUint16(26, 0x0100);

    return data;
  }

  private static buildHDLR(): ArrayBuffer {
    const name = 'VideoHandler';
    const data = new Uint8Array(33 + name.length);
    const view = new DataView(data.buffer);

    view.setUint32(0, 33 + name.length);
    view.setUint32(4, 0x68646c72);
    view.setUint8(8, 0);
    view.setUint32(12, 0x00000000);
    view.setUint32(16, 0x76696465);
    view.setUint32(20, 0x00000000);
    view.setUint32(24, 0x00000000);
    view.setUint32(28, 0x56696465);
    data.set(new TextEncoder().encode(name), 33);

    return data.buffer;
  }

  private static buildMINF(width: number, height: number, duration: number): ArrayBuffer {
    const vmhd = this.buildVMHD();
    const dinf = this.buildDINF();
    const stbl = this.buildSTBL(width, height, duration);

    const size = 8 + vmhd.byteLength + dinf.byteLength + stbl.byteLength;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x6d696e66);
    buffer.set(new Uint8Array(vmhd), 8);
    buffer.set(new Uint8Array(dinf), 8 + vmhd.byteLength);
    buffer.set(new Uint8Array(stbl), 8 + vmhd.byteLength + dinf.byteLength);

    return buffer.buffer;
  }

  private static buildVMHD(): ArrayBuffer {
    const data = new ArrayBuffer(20);
    const view = new DataView(data);

    view.setUint32(0, 20);
    view.setUint32(4, 0x766d6864);
    view.setUint8(8, 0);
    view.setUint16(12, 0x0001);
    view.setUint32(16, 0x00000000);

    return data;
  }

  private static buildDINF(): ArrayBuffer {
    const dref = this.buildDREF();
    const size = 8 + dref.byteLength;
    const data = new Uint8Array(size);
    const view = new DataView(data.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x64696e66);
    data.set(new Uint8Array(dref), 8);

    return data.buffer;
  }

  private static buildDREF(): ArrayBuffer {
    const url = new Uint8Array(18);
    const view = new DataView(url.buffer);

    view.setUint32(0, 18);
    view.setUint32(4, 0x75726c20);
    view.setUint8(8, 0);
    view.setUint32(12, 0x00000001);
    view.setUint32(16, 0x00000000);

    const size = 8 + url.byteLength;
    const data = new Uint8Array(size);
    const outerView = new DataView(data.buffer);

    outerView.setUint32(0, size);
    outerView.setUint32(4, 0x64726566);
    outerView.setUint32(8, 0x00000001);
    data.set(new Uint8Array(url), 12);

    return data.buffer;
  }

  private static buildSTBL(width: number, height: number, duration: number): ArrayBuffer {
    const stsd = this.buildSTSD(width, height);
    const stts = this.buildSTTS(duration);
    const stsc = this.buildSTSC();
    const stsz = this.buildSTSZ();
    const stco = this.buildSTCO();

    const size =
      8 + stsd.byteLength + stts.byteLength + stsc.byteLength + stsz.byteLength + stco.byteLength;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x7374626c);
    let offset = 8;

    buffer.set(new Uint8Array(stsd), offset);
    offset += stsd.byteLength;

    buffer.set(new Uint8Array(stts), offset);
    offset += stts.byteLength;

    buffer.set(new Uint8Array(stsc), offset);
    offset += stsc.byteLength;

    buffer.set(new Uint8Array(stsz), offset);
    offset += stsz.byteLength;

    buffer.set(new Uint8Array(stco), offset);

    return buffer.buffer;
  }

  private static buildSTSD(width: number, height: number): ArrayBuffer {
    const avc1 = this.buildAVC1(width, height);

    const size = 8 + avc1.byteLength;
    const data = new Uint8Array(size);
    const view = new DataView(data.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x73747364);
    view.setUint32(8, 0x00000001);
    data.set(new Uint8Array(avc1), 12);

    return data.buffer;
  }

  private static buildAVC1(width: number, height: number): ArrayBuffer {
    const data = new ArrayBuffer(78);
    const view = new DataView(data);

    view.setUint32(0, 78);
    view.setUint32(4, 0x61766331);
    view.setUint16(8, 0x00000000);
    view.setUint16(12, 0x00000001);
    view.setUint16(14, 0x00000000);
    view.setUint32(16, 0x00000000);
    view.setUint16(20, 0x00000000);
    view.setUint16(22, width);
    view.setUint16(24, height);
    view.setUint32(26, 0x00480000);
    view.setUint32(30, 0x00480000);
    view.setUint32(34, 0x00000000);
    view.setUint32(38, 0x00000000);
    view.setUint16(42, 0x00000018);
    view.setUint16(44, 0x01000100);
    view.setUint16(48, 0x00000000);
    view.setUint16(50, 0x00000000);
    view.setUint16(52, 0x00000000);
    view.setUint16(54, 0x00000000);
    view.setUint16(56, 0x00000000);
    view.setUint16(58, 0x00000000);
    view.setUint16(60, 0x00000000);
    view.setUint16(62, 0x00000000);
    view.setUint16(64, 0x00000000);
    view.setUint16(66, 0x00000000);
    view.setUint16(68, 0x00000000);
    view.setUint16(70, 0x00000000);
    view.setUint16(72, 0x00000000);
    view.setUint16(74, 0x00000000);
    view.setUint16(76, 0x00000000);

    return data;
  }

  private static buildSTTS(duration: number): ArrayBuffer {
    const data = new ArrayBuffer(16);
    const view = new DataView(data);

    view.setUint32(0, 16);
    view.setUint32(4, 0x73747473);
    view.setUint32(8, 0x00000001);
    view.setUint32(12, duration);

    return data;
  }

  private static buildSTSC(): ArrayBuffer {
    const data = new ArrayBuffer(20);
    const view = new DataView(data);

    view.setUint32(0, 20);
    view.setUint32(4, 0x73747363);
    view.setUint32(8, 0x00000001);
    view.setUint32(12, 0x00000001);
    view.setUint32(16, 0x00000001);

    return data;
  }

  private static buildSTSZ(): ArrayBuffer {
    const data = new ArrayBuffer(20);
    const view = new DataView(data);

    view.setUint32(0, 20);
    view.setUint32(4, 0x7374737a);
    view.setUint32(8, 0x00000000);
    view.setUint32(12, 0x00000001);
    view.setUint32(16, 0x00000000);

    return data;
  }

  private static buildSTCO(): ArrayBuffer {
    const data = new ArrayBuffer(16);
    const view = new DataView(data);

    view.setUint32(0, 16);
    view.setUint32(4, 0x7374636f);
    view.setUint32(8, 0x00000001);
    view.setUint32(12, 0x00000000);

    return data;
  }

  private static buildUDTA(): ArrayBuffer {
    return new ArrayBuffer(8);
  }

  private static buildMDAT(data: ArrayBuffer): ArrayBuffer {
    const size = 8 + data.byteLength;
    const buffer = new Uint8Array(size);
    const view = new DataView(buffer.buffer);

    view.setUint32(0, size);
    view.setUint32(4, 0x6d646174);
    buffer.set(new Uint8Array(data), 8);

    return buffer.buffer;
  }

  /**
   * Verify TS sync byte pattern
   */
  static verifyTSSync(data: Uint8Array): boolean {
    const packetSize = 188;

    for (let i = 0; i < Math.min(data.length, packetSize * 3); i += packetSize) {
      if (data[i] !== TSMerger.TS_SYNC_BYTE) {
        return false;
      }
    }

    return true;
  }
}

class MP4Builder {
  private width: number;
  private height: number;
  private duration: number;
  private timescale: number;

  constructor(options: {
    width: number;
    height: number;
    duration: number;
    timescale: number;
  }) {
    this.width = options.width;
    this.height = options.height;
    this.duration = options.duration;
    this.timescale = options.timescale;
  }

  build(_videoData: ArrayBuffer): ArrayBuffer {
    return TSMerger.buildMP4FromPES(_videoData, {
      width: this.width,
      height: this.height,
      duration: this.duration,
    });
  }
}
