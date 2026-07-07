import { parseMpeg1Layer3FrameHeader } from "../../src/mp3/mp3FrameCounter.js";

export interface SyntheticFrameOptions {
  bitrateIndex?: number;
  sampleRateIndex?: number;
  padding?: number;
}

export function createSyntheticMp3(
  frameCount: number,
  options: SyntheticFrameOptions = {},
): Uint8Array {
  const frames: Uint8Array[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    frames.push(createSyntheticMpeg1Layer3Frame(options));
  }

  return concatBytes(frames);
}

export function createSyntheticMp3WithId3v2(
  frameCount: number,
  options: SyntheticFrameOptions = {},
): Uint8Array {
  const tagPayload = new Uint8Array([0x43, 0x4f, 0x44, 0x45, 0x58]);
  const header = new Uint8Array([
    0x49,
    0x44,
    0x33,
    0x04,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    tagPayload.length,
  ]);

  return concatBytes([header, tagPayload, createSyntheticMp3(frameCount, options)]);
}

export function createSyntheticMpeg1Layer3Frame(options: SyntheticFrameOptions = {}): Uint8Array {
  const bitrateIndex = options.bitrateIndex ?? 9;
  const sampleRateIndex = options.sampleRateIndex ?? 0;
  const padding = options.padding ?? 0;

  const headerBytes = createHeaderBytes({
    versionBits: 0b11,
    layerBits: 0b01,
    bitrateIndex,
    sampleRateIndex,
    padding,
  });

  const header = parseMpeg1Layer3FrameHeader(headerBytes, 0);

  if (!header) {
    throw new Error("Synthetic frame options produced an invalid header.");
  }

  const frame = new Uint8Array(header.frameLengthBytes);
  frame.set(headerBytes, 0);

  return frame;
}

export function createUnsupportedMpeg2Layer3Frame(): Uint8Array {
  const bytes = createHeaderBytes({
    versionBits: 0b10,
    layerBits: 0b01,
    bitrateIndex: 9,
    sampleRateIndex: 0,
    padding: 0,
  });
  const frame = new Uint8Array(200);
  frame.set(bytes, 0);

  return frame;
}

function createHeaderBytes(options: {
  versionBits: number;
  layerBits: number;
  bitrateIndex: number;
  sampleRateIndex: number;
  padding: number;
}): Uint8Array {
  const header =
    (0x7ff << 21) |
    (options.versionBits << 19) |
    (options.layerBits << 17) |
    (1 << 16) |
    (options.bitrateIndex << 12) |
    (options.sampleRateIndex << 10) |
    (options.padding << 9) |
    (0 << 6);

  return new Uint8Array([
    (header >>> 24) & 0xff,
    (header >>> 16) & 0xff,
    (header >>> 8) & 0xff,
    header & 0xff,
  ]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}