import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/platform/service-runtime/usage/UsageRuntime.js", "utf8");

test("service usage persistence strips inline base64 media from metadata", () => {
  assert.match(source, /LARGE_MEDIA_KEYS/);
  assert.match(source, /audio_base64/);
  assert.match(source, /image_base64/);
  assert.match(source, /video_base64/);
  assert.match(source, /persisted_inline: false/);
  assert.match(source, /sanitizeJsonValue\(entry, seen, key\)/);
});
