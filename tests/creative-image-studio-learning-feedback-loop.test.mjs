import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const taste=fs.readFileSync("lib/creative/learning/runtime/CreativeTemporalTasteMemoryRuntime.js","utf8");
const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const production=fs.readFileSync("lib/creative/learning/runtime/CreativeProductionLearningRuntime.js","utf8");

test("production learning exposes Image Studio recurring failures and accepted rejected design evidence",()=>{
  assert.match(production,/image_studio_failure_frequency/);
  assert.match(production,/image_studio_exploration_pairs/);
});

test("taste memory converts Image Studio evidence into advisory learning only",()=>{
  assert.match(taste,/imageStudioRecurringFailures/);
  assert.match(taste,/imageStudioExplorationPairs/);
  assert.match(taste,/image_studio_learning/);
  assert.match(taste,/style_copy_forbidden: true/);
  assert.match(taste,/repeat_known_failure_without_new_evidence_forbidden: true/);
});

test("Image Studio generation consumes failure memory without copying prior work",()=>{
  assert.match(graph,/image_studio_learning/);
  assert.match(graph,/ADVISORY IMAGE STUDIO REJECT MEMORY/);
  assert.match(graph,/ADVISORY IMAGE STUDIO DESIGN EVIDENCE/);
  assert.match(graph,/style\/composition must never be copied/);
  assert.match(graph,/prior failures must not be repeated without new evidence/);
});
