import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createSyntheticMp3, createSyntheticMp3WithId3v2 } from "../tests/helpers/syntheticMp3.js";

const fixtureDir = path.resolve("tests/fixtures/generated");
await mkdir(fixtureDir, { recursive: true });

const fixtures = [
  {
    name: "synthetic-003-frames.mp3",
    bytes: createSyntheticMp3(3),
  },
  {
    name: "synthetic-id3v2-005-frames.mp3",
    bytes: createSyntheticMp3WithId3v2(5),
  },
];

for (const fixture of fixtures) {
  await writeFile(path.join(fixtureDir, fixture.name), fixture.bytes);
}

console.log(`Wrote ${fixtures.length} synthetic MP3 frame fixtures to ${fixtureDir}.`);
