import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { Mp3FrameCounterError } from "../../src/mp3/errors.js";
import { countMp3Frames } from "../../src/mp3/mp3FrameCounter.js";
import {
  createSyntheticMp3,
  createSyntheticMp3WithId3v2,
  createSyntheticMpeg1Layer3Frame,
  createUnsupportedMpeg2Layer3Frame,
} from "../helpers/syntheticMp3.js";

describe("countMp3Frames", () => {
  it("counts the provided sample MP3", async () => {
    const samplePath = path.resolve("tests/fixtures/sample.mp3");
    const sample = await readFile(samplePath);

    expect(countMp3Frames(sample).frameCount).toBe(6089);
  });

  it("counts a generated sequence of MPEG Version 1 Layer III frames", () => {
    const bytes = createSyntheticMp3(3);

    expect(countMp3Frames(bytes)).toMatchObject({
      frameCount: 3,
      physicalFrameCount: 3,
      firstFrameOffset: 0,
    });
  });

  it("excludes a leading Xing metadata frame from the audio frame count", () => {
    const metadataFrame = createSyntheticMpeg1Layer3Frame();
    const audioFrames = createSyntheticMp3(2);
    metadataFrame.set([0x58, 0x69, 0x6e, 0x67], 36);

    const bytes = new Uint8Array(metadataFrame.length + audioFrames.length);
    bytes.set(metadataFrame, 0);
    bytes.set(audioFrames, metadataFrame.length);

    expect(countMp3Frames(bytes)).toMatchObject({
      frameCount: 2,
      physicalFrameCount: 3,
      leadingMetadataFramesIgnored: 1,
    });
  });

  it("skips an ID3v2 tag before counting frames", () => {
    const bytes = createSyntheticMp3WithId3v2(5);

    expect(countMp3Frames(bytes)).toMatchObject({
      frameCount: 5,
      id3v2BytesSkipped: 15,
    });
  });

  it("ignores unsupported MPEG versions", () => {
    expect(() => countMp3Frames(createUnsupportedMpeg2Layer3Frame())).toThrow(Mp3FrameCounterError);
  });

  it("reports empty uploads", () => {
    expect(() => countMp3Frames(new Uint8Array())).toThrow("The uploaded file is empty.");
  });

  it("reports a truncated frame after a valid frame sequence has started", () => {
    const validFrame = createSyntheticMpeg1Layer3Frame();
    const truncatedFrame = createSyntheticMpeg1Layer3Frame().slice(0, 24);
    const bytes = new Uint8Array(validFrame.length + truncatedFrame.length);
    bytes.set(validFrame, 0);
    bytes.set(truncatedFrame, validFrame.length);

    expect(() => countMp3Frames(bytes)).toThrow("final frame was complete");
  });
});
