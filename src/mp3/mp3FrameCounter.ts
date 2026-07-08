import { readFile } from "node:fs/promises";

import { Mp3FrameCounterError } from "./errors.js";

// MPEG header fields are bit-packed. These constants are the bit patterns for
// MPEG Version 1 and Layer III after the header has been shifted into place.
const MPEG_VERSION_1 = 0b11; // MPEG Version 1 is indicated by the bits 11 in the version field of the header.
const MPEG_LAYER_III = 0b01; // Layer III is indicated by the bits 01 in the layer field of the header.

// Every MP3 frame begins with an 11-bit sync word. The mask isolates those bits
// from the 32-bit frame header so random data does not parse as a frame.

// NOTE: I am waiting to hear back from Jack on is we need to actually
// need to go through validation of frame (I suspect we will...)

const SYNC_MASK = 0xffe00000 >>> 0;
const SYNC_VALUE = 0xffe00000 >>> 0;

// The bitrate field is a 4-bit index into the MPEG1 Layer III table, not a
// literal bitrate. Indexes 0 and 15 are reserved, so they map to undefined.
// This is used later to validate data and calculate frame lengths.
const MPEG1_LAYER3_BITRATE_KBPS: ReadonlyArray<number | undefined> = [
  undefined,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  undefined,
];

// The sample-rate field is a 2-bit index. Index 3 reserved per the specification.
const MPEG1_SAMPLE_RATES_HZ: ReadonlyArray<number | undefined> = [
  44_100,
  48_000,
  32_000,
  undefined,
];

export interface Mp3FrameHeader {
  bitrateKbps: number;
  sampleRateHz: number;
  paddingBytes: number;
  frameLengthBytes: number;
  channelMode: number; // For mono we allocate 21 bytes for side information, and for stereo we allocate 36 bytes.
  // This is used to calculate the offset of the Xing/Info metadata frame.
}

export interface Mp3FrameCountResult {
  // Public audio-frame count after excluding encoder metadata frames.
  frameCount: number;

  // Raw frame count before excluding a possible leading Xing/Info/VBRI frame.
  physicalFrameCount: number;
  leadingMetadataFramesIgnored: number;
  firstFrameOffset: number;
  lastFrameEndOffset: number;
  id3v2BytesSkipped: number;
  bytesScanned: number;
}

export async function countMp3FramesFromFile(filePath: string): Promise<Mp3FrameCountResult> {
  const bytes = await readFile(filePath);
  return countMp3Frames(bytes);
}

// Counts frames by walking from one parsed header to the next calculated frame
// boundary. That avoids treating every sync-looking byte pattern as a frame.
export function countMp3Frames(input: Uint8Array): Mp3FrameCountResult {
  if (input.length === 0) {
    throw new Mp3FrameCounterError("EMPTY_FILE", "The uploaded file is empty.");
  }

  const id3v2BytesSkipped = getId3v2SkipLength(input);

  // Based on my search, ID3v1 metadata is always a 128-byte footer, so the parser excludes that
  // footer from the audio-data scan when it is present.
  const effectiveLength = hasId3v1Tag(input) ? input.length - 128 : input.length;

  let offset = id3v2BytesSkipped;
  let frameCount = 0;
  let firstFrameOffset = -1;
  let lastFrameEndOffset = offset;
  let firstFrameHeader: Mp3FrameHeader | null = null;

  while (offset <= effectiveLength - 4) {
    // Each audio frame has at least a 4 byte header
    const frame = parseMpeg1Layer3FrameHeader(input, offset);

    if (!frame) {
      // Move forward by one byte until a valid header is found. Once a frame is
      // found, the loop jumps by the calculated frame length instead.
      offset += 1;
      continue;
    }

    const nextFrameOffset = offset + frame.frameLengthBytes;

    if (nextFrameOffset > effectiveLength) {
      // A partial frame after a contiguous run indicates a truncated file. If no
      // run has started, treat it as a false-positive header and keep scanning.
      if (frameCount > 0 && offset === lastFrameEndOffset) {
        throw new Mp3FrameCounterError(
          "TRUNCATED_MP3_FRAME",
          "The MP3 data ended before the final frame was complete.",
        );
      }

      offset += 1;
      continue;
    }

    frameCount += 1;
    firstFrameOffset = firstFrameOffset === -1 ? offset : firstFrameOffset;
    firstFrameHeader = firstFrameHeader ?? frame;
    lastFrameEndOffset = nextFrameOffset;
    offset = nextFrameOffset;
  }

  if (frameCount === 0) {
    throw new Mp3FrameCounterError(
      "UNSUPPORTED_MP3_FORMAT",
      "No MPEG Version 1 Layer III frames were found in the uploaded file.",
    );
  }

  // Xing, Info, and VBRI frames carry encoder/VBR metadata. They use a normal
  // frame header, so they must be detected after the first frame is parsed.
  const leadingMetadataFramesIgnored =
    firstFrameHeader && hasLeadingMetadataFrame(input, firstFrameOffset, firstFrameHeader) ? 1 : 0;
  const audioFrameCount = frameCount - leadingMetadataFramesIgnored;

  return {
    frameCount: audioFrameCount,
    physicalFrameCount: frameCount,
    leadingMetadataFramesIgnored,
    firstFrameOffset,
    lastFrameEndOffset,
    id3v2BytesSkipped,
    bytesScanned: effectiveLength,
  };
}

function hasLeadingMetadataFrame(
  bytes: Uint8Array,
  frameOffset: number,
  frameHeader: Mp3FrameHeader,
): boolean {
  // Xing/Info location depends on channel mode because mono frames have a
  // shorter side-information section than stereo/joint-stereo frames.
  const xingOffset = frameOffset + (frameHeader.channelMode === 0b11 ? 21 : 36);

  // VBRI uses a fixed offset from the beginning of the first frame.
  const vbriOffset = frameOffset + 36;

  return (
    hasAsciiMarker(bytes, xingOffset, "Xing") ||
    hasAsciiMarker(bytes, xingOffset, "Info") ||
    hasAsciiMarker(bytes, vbriOffset, "VBRI")
  );
}

function hasAsciiMarker(bytes: Uint8Array, offset: number, marker: string): boolean {
  if (offset < 0 || offset + marker.length > bytes.length) {
    return false;
  }

  for (let index = 0; index < marker.length; index += 1) {
    if (bytes[offset + index] !== marker.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

export function parseMpeg1Layer3FrameHeader(
  bytes: Uint8Array,
  offset: number,
): Mp3FrameHeader | null {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }

  const header = readUint32BigEndian(bytes, offset);

  if ((header & SYNC_MASK) >>> 0 !== SYNC_VALUE) {
    return null;
  }

  const versionBits = (header >>> 19) & 0b11;
  const layerBits = (header >>> 17) & 0b11;

  // Only MPEG Version 1 Layer III headers produce frame lengths here.
  if (versionBits !== MPEG_VERSION_1 || layerBits !== MPEG_LAYER_III) {
    return null;
  }

  const bitrateIndex = (header >>> 12) & 0b1111;
  const sampleRateIndex = (header >>> 10) & 0b11;
  const bitrateKbps = MPEG1_LAYER3_BITRATE_KBPS[bitrateIndex];
  const sampleRateHz = MPEG1_SAMPLE_RATES_HZ[sampleRateIndex];

  if (!bitrateKbps || !sampleRateHz) {
    return null;
  }

  const paddingBytes = (header >>> 9) & 0b1;
  const channelMode = (header >>> 6) & 0b11;

  // MPEG1 Layer III frame length:
  // floor((144 * bitrate bits/sec) / sample rate Hz + optional padding byte) where the bitrate is in bits per second, not kilobits per second
  // and 144 is a constant derived from the MPEG1 Layer III frame length formula
  // (144 is bytes per frame: 1152 samples per frame / 8 bits per byte).
  const frameLengthBytes = Math.floor((144 * bitrateKbps * 1000) / sampleRateHz + paddingBytes);

  if (frameLengthBytes <= 4) {
    return null;
  }

  return {
    bitrateKbps,
    sampleRateHz,
    paddingBytes,
    frameLengthBytes,
    channelMode,
  };
}

function getId3v2SkipLength(bytes: Uint8Array): number {
  // ID3v2 tags begin with a 10-byte header and ASCII bytes "ID3".
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return 0;
  }

  const majorVersion = bytes[3];
  const revision = bytes[4];
  const flags = bytes[5];

  if (majorVersion === undefined || revision === undefined || flags === undefined) {
    return 0;
  }

  if (majorVersion === 0xff || revision === 0xff) {
    throw new Mp3FrameCounterError("INVALID_ID3_TAG", "The ID3v2 header is invalid.");
  }

  // The ID3v2 size field starts at byte 6 and stores only the tag body size (bytes 6-9).
  const tagSize = readSynchsafeInt(bytes, 6);

  // ID3v2.4 can add a 10-byte footer when flag bit 4 is set.
  const footerLength = majorVersion === 4 && (flags & 0x10) === 0x10 ? 10 : 0;

  // Total bytes to skip are header + tag body + optional footer.
  const skipLength = 10 + tagSize + footerLength;

  if (skipLength > bytes.length) {
    throw new Mp3FrameCounterError(
      "TRUNCATED_ID3_TAG",
      "The ID3v2 tag reports more bytes than the file contains.",
    );
  }

  return skipLength;
}

function readSynchsafeInt(bytes: Uint8Array, offset: number): number {
  const sizeBytes = [
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  ] as const;

  // Synchsafe integers use only 7 bits per byte, so each high bit must be zero. (byte & 128) !==0
  if (sizeBytes.some((byte) => byte === undefined || (byte & 0x80) !== 0)) {
    throw new Mp3FrameCounterError("INVALID_ID3_TAG", "The ID3v2 tag size is invalid.");
  }

  // The 28-bit synchsafe integer is stored big-endian across four bytes.
  return (
    ((sizeBytes[0] ?? 0) << 21) |
    ((sizeBytes[1] ?? 0) << 14) |
    ((sizeBytes[2] ?? 0) << 7) |
    (sizeBytes[3] ?? 0)
  );
}

function hasId3v1Tag(bytes: Uint8Array): boolean {
  // ID3v1 is identified by ASCII "TAG" at the start of the 128-byte footer.
  const tagOffset = bytes.length - 128;

  return (
    tagOffset >= 0 &&
    bytes[tagOffset] === 0x54 &&
    bytes[tagOffset + 1] === 0x41 &&
    bytes[tagOffset + 2] === 0x47
  );
}

// Reads a 32-bit unsigned integer from the given bytes in big-endian format.
function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  // MP3 header bits are defined big-endian across four bytes.
  // Treat 4 header bytes as one 32-bit unsigned integer for easier bit manipulation.
  return (
    (((bytes[offset] ?? 0) << 24) >>> 0) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}
