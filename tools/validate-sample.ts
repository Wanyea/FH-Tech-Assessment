import { stat } from "node:fs/promises";
import path from "node:path";

import { countMp3FramesFromFile } from "../src/mp3/mp3FrameCounter.js";

const [filePathArgument, expectedFrameCountArgument] = process.argv.slice(2);

if (!filePathArgument) {
  console.error("Usage: npm run validate:sample -- <mp3-path> [expected-frame-count]");
  process.exit(1);
}

const filePath = path.resolve(filePathArgument);
const expectedFrameCount = expectedFrameCountArgument
  ? Number.parseInt(expectedFrameCountArgument, 10)
  : undefined;

const fileStats = await stat(filePath);
const result = await countMp3FramesFromFile(filePath);

if (expectedFrameCount !== undefined && result.frameCount !== expectedFrameCount) {
  console.error(
    `Expected ${expectedFrameCount} frames but counted ${result.frameCount} frames in ${filePath}.`,
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      file: filePath,
      bytes: fileStats.size,
      frameCount: result.frameCount,
      physicalFrameCount: result.physicalFrameCount,
      leadingMetadataFramesIgnored: result.leadingMetadataFramesIgnored,
      firstFrameOffset: result.firstFrameOffset,
      id3v2BytesSkipped: result.id3v2BytesSkipped,
    },
    null,
    2,
  ),
);
