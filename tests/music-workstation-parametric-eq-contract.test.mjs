import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicParametricEqRuntime.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicParametricEqPanel.jsx", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("../lib/creative/music/client/MusicMultitrackPreviewEngine.js", import.meta.url), "utf8");
const rack = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicEngineeringInsertsPanel.jsx", import.meta.url), "utf8");

test("parametric EQ supports surgical professional band types without destructive edits", () => {
  assert.match(runtime, /"bell", "lowshelf", "highshelf", "lowpass", "highpass", "notch"/);
  assert.match(runtime, /frequency_hz/);
  assert.match(runtime, /gain_db/);
  assert.match(runtime, /q:/);
  assert.match(runtime, /destructive_processing_allowed:\s*false/);
});

test("audible preview maps precision bands to real Biquad filters", () => {
  assert.match(preview, /connectParametricEq/);
  assert.match(preview, /context\.createBiquadFilter\(\)/);
  assert.match(preview, /browserFilterType/);
  assert.match(preview, /parametric_eq_aware:\s*true/);
  const broadTone = preview.indexOf("highShelf.gain.value");
  const precisionEq = preview.indexOf("chain = connectParametricEq(context, highShelf, track)");
  const deesser = preview.indexOf('enabledInsert(track, "deesser")');
  assert.ok(broadTone >= 0);
  assert.ok(precisionEq > broadTone);
  assert.ok(deesser > precisionEq);
});

test("engineer UI exposes frequency gain Q and filter type per band", () => {
  assert.match(panel, /Parametric EQ/);
  assert.match(panel, /Frequency Hz/);
  assert.match(panel, /Gain dB/);
  assert.match(panel, />Q</);
  assert.match(panel, /Notch/);
  assert.match(rack, /MusicParametricEqPanel/);
});
