import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const gate = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const graph = fs.readFileSync("lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime.js", "utf8");
const fingerprint = fs.readFileSync("lib/creative/quality/runtime/CreativeCrossShotFingerprintRuntime.js", "utf8");
test("cross-shot novelty is a live perceptual release gate", () => {
  assert.match(gate, /async function enforceCrossShotNovelty/);
  assert.match(gate, /GENERATED_MEDIA_CROSS_SHOT_DUPLICATE_REJECTED/);
  assert.match(gate, /image_asset_duplicate_quarantined: true/);
  assert.match(gate, /rejected_before_editing: true/);
});
test("fingerprint reads persisted production requirements", () => {
  assert.match(fingerprint, /const requirements = metadata\.requirements \|\| \{\}/);
  assert.match(fingerprint, /requirements\.signature_frame_design/);
  assert.match(fingerprint, /requirements\.production_design/);
  assert.match(fingerprint, /requirements\.lighting/);
});
test("asset graph exposes governed get and update for novelty evidence", () => {
  assert.match(graph, /async get\(id\)/);
  assert.match(graph, /return Repository\.getById\(id\)/);
  assert.match(graph, /async update\(id, values = \{\}\)/);
});
