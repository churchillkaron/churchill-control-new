import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCreativeFloorExecutionRuntime.js", "utf8");

test("Music creative floor batches all specialist critics per concept without merging their judgements", () => {
  assert.match(source, /MUSIC_STUDIO_CRITIC_PANEL/);
  assert.match(source, /evaluate_each_critic_independently: true/);
  assert.match(source, /do_not_average_or_merge_critic_judgements: true/);
  assert.match(source, /return_exactly_one_review_per_critic: true/);
  assert.match(source, /Promise\.all\(concepts\.map\(\(conceptRow\) => criticPanel/);
  assert.doesNotMatch(source, /for \(const criticSpec of development\.concept_competition\.critics\)/);
});

test("Music critic panel fails closed when any required critic review is absent", () => {
  assert.match(source, /CREATIVE_MUSIC_CRITIC_REVIEW_MISSING/);
  assert.match(source, /critic_id: criticSpec\.id/);
  assert.match(source, /concept_id: conceptRow\.id/);
});


test("owned local Deep reviews allow the full five-minute specialist window", () => {
  const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js", "utf8");
  assert.match(local, /DEFAULT_TIMEOUT_MS = 300000/);
  assert.match(local, /modal_inference_performed: false/);
  assert.match(local, /runpod_inference_performed: false/);
  assert.doesNotMatch(local, /executeIntelligenceModalDirect|api\.runpod\.ai|patchWorkers/);
});


test("Music creative floor parallelizes independent concepts and concept panels", () => {
  assert.match(source, /Promise\.all\(development\.concept_competition\.concepts\.map/);
  assert.match(source, /Promise\.all\(concepts\.map\(\(conceptRow\) => criticPanel/);
});
