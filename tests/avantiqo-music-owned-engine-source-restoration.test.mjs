import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const required = [
  "services/avantiqo-music-vocal-correction-engine/handler.py",
  "services/avantiqo-music-vocal-correction-engine/handler_v2.py",
  "services/avantiqo-music-vocal-correction-engine/requirements.txt",
  "services/avantiqo-music-elastic-engine/Dockerfile",
  "services/avantiqo-music-elastic-engine/handler.py",
  "services/avantiqo-music-elastic-engine/requirements.txt",
];

test("owned vocal-correction and elastic worker source remains reproducible in the repository", async () => {
  await Promise.all(required.map((file) => access(file)));
  const vocal = await readFile(required[1], "utf8");
  const elastic = await readFile(required[4], "utf8");
  assert.match(vocal, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2/);
  assert.match(vocal, /TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2/);
  assert.match(elastic, /AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1/);
  assert.match(elastic, /SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2/);
});
