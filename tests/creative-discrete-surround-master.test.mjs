import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/audio/runtime/CreativeDiscreteSurroundMasterRuntime.js",
  "utf8",
);

test("surround runtime exposes exact discrete speaker layouts", () => {
  assert.match(source, /"5\.1": Object\.freeze\(\["FL", "FR", "FC", "LFE", "SL", "SR"\]\)/);
  assert.match(source, /"7\.1": Object\.freeze\(\["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"\]\)/);
  assert.match(source, /"7\.1\.4": Object\.freeze\(\["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR", "TFL", "TFR", "TBL", "TBR"\]\)/);
});

test("surround master requires discrete mono sources instead of automatic stereo upmix", () => {
  assert.match(source, /SURROUND_DISCRETE_CHANNEL_SOURCES_REQUIRED/);
  assert.match(source, /SURROUND_SOURCE_MUST_BE_MONO/);
  assert.match(source, /stereo_upmix_as_surround_master_forbidden: true/);
});
test("surround delivery is 24-bit 48k PCM and Atmos remains unclaimed", () => {
  assert.match(source, /"-ar", "48000"/);
  assert.match(source, /"-c:a", "pcm_s24le"/);
  assert.match(source, /dolby_atmos_claimed: false/);
  assert.match(source, /object_audio_claimed: false/);
  assert.match(source, /dolby_atmos_requires_separate_object_metadata_and_renderer: true/);
});

test("7.1.4 is treated as twelve discrete channels", () => {
  assert.match(source, /"7\.1\.4": Object\.freeze\(\[[^\]]*"TFL"[^\]]*"TBR"[^\]]*\]\)/);
  assert.match(source, /const expectedChannels = ordered\.length/);
});
