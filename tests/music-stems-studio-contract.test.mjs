import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildMusicTransformationPlan,
  MUSIC_STEM_SEPARATOR_LANE,
  MUSIC_STEM_SEPARATOR_PROFILE,
} from "../lib/creative/runtime/engines/MusicEngine.js";

const route = fs.readFileSync(
  new URL("../app/api/creative/music/stems/route.js", import.meta.url),
  "utf8",
);
const workspace = fs.readFileSync(
  new URL("../components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", import.meta.url),
  "utf8",
);
const panel = fs.readFileSync(
  new URL("../components/creative/ProductionStudio/workspaces/MusicStemsPanel.jsx", import.meta.url),
  "utf8",
);

const source = "storage://creative-assets/example/source.wav";

test("Music stems engine is implemented but certification gated", () => {
  const plan = buildMusicTransformationPlan("stems", {
    source_audio: source,
    source_duration_seconds: 180,
    source_rights_confirmed: true,
  });
  assert.equal(plan.capability, "ai.audio.stems");
  assert.equal(plan.task_type, "separate_stems");
  assert.equal(plan.model_lane, MUSIC_STEM_SEPARATOR_LANE);
  assert.equal(plan.quality_profile, MUSIC_STEM_SEPARATOR_PROFILE);
  assert.equal(plan.implementation, "IMPLEMENTED");
  assert.equal(plan.certification, "BENCHMARK_AND_HUMAN_REVIEW_REQUIRED");
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.separation.stems, ["vocals", "drums", "bass", "other"]);
  assert.deepEqual(plan.output_spec.deliveries, ["stems_wav"]);
});

test("Music Studio exposes a dedicated Stems tab", () => {
  assert.match(workspace, /id: "stems"/);
  assert.match(workspace, /label: "Stems"/);
  assert.match(workspace, /MusicStemsPanel/);
});

test("Music Stems panel uses private upload and explicit rights confirmation", () => {
  assert.match(panel, /\/api\/creative\/music\/stems/);
  assert.match(panel, /prepare_source_upload/);
  assert.match(panel, /source_rights_confirmed: true/);
  assert.match(panel, /Vocals/);
  assert.match(panel, /Drums/);
  assert.match(panel, /Bass/);
  assert.match(panel, /Other/);
  assert.match(panel, /disabled=!executionReady|disabled=\{!executionReady\}/);
});

test("Music Stems route remains plan-only while certification is pending", () => {
  assert.match(route, /buildMusicTransformationPlan\("stems"/);
  assert.match(route, /music-stems/);
  assert.match(route, /createSignedUploadUrl/);
  assert.match(route, /ready_for_execution: stemPlan\.executable === true/);
  assert.doesNotMatch(route, /executeService/);
  assert.doesNotMatch(route, /settlePendingService/);
  assert.doesNotMatch(route, /pricing_activation/);
});
