import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("full owned-media benchmark fails closed on output size and real lip-sync fixture", () => {
  const runner = source("scripts/benchmark-avantiqo-owned-media-full.mjs");
  assert.match(runner, /Number\(output\.size_bytes\) > 10000/);
  assert.doesNotMatch(runner, /output\.size_bytes \|\| 1/);
  assert.match(runner, /fixtures\.lipsync_video_source_url/);
  assert.match(runner, /const lipsyncVideoSource = assertHttps/);
  assert.match(runner, /source_video:\s*lipsyncVideoSource/);
  assert.match(runner, /source_asset_roles:\s*\{[\s\S]*source_video:\s*lipsyncVideoSource/);
});

test("local fixture preparer is provider-free and normalizes lip-sync media", () => {
  const preparer = source("scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs");
  assert.match(preparer, /provider_calls_added:\s*0/);
  assert.match(preparer, /platform-certification\/owned-media-local/);
  assert.match(preparer, /AVANTIQO_MEDIA_CERTIFICATION_FACE_VIDEO_PATH/);
  assert.match(preparer, /AVANTIQO_MEDIA_CERTIFICATION_FACE_AUDIO_PATH/);
  assert.match(preparer, /normalizedLipSyncFixtures/);
  assert.match(preparer, /"-c:v",\s*"libx264"/);
  assert.match(preparer, /format=yuv420p/);
  assert.match(preparer, /"-ac",\s*"1"/);
  assert.match(preparer, /"-ar",\s*"16000"/);
  assert.match(preparer, /"-c:a",\s*"pcm_s16le"/);
  assert.match(preparer, /AVANTIQO_MEDIA_CERTIFICATION_LIPSYNC_DURATION_MISMATCH/);
  assert.match(preparer, /lipsync_input_normalized_locally_before_upload:\s*true/);
});
