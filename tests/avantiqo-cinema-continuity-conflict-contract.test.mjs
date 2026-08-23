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

test("Cinema continuity conflicts are resolved or blocked before provider and GPU spend", () => {
  const gate = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityConflictGate.js",
  );

  assert.match(gate, /CREATIVE_CINEMATIC_CONTINUITY_CONFLICT_GATE_V1/);
  assert.match(gate, /CREATIVE_CINEMATIC_CONTINUITY_RESOLUTION_V1/);
  assert.match(gate, /CREATIVE_CINEMATIC_INTENTIONAL_CHANGE_V1/);
  assert.match(gate, /pre_gpu:\s*true/);
  assert.match(gate, /provider_calls_added:\s*0/);
  assert.match(gate, /provider_submission_blocked:\s*true/);
  assert.match(gate, /gpu_spend_blocked:\s*true/);
  assert.match(gate, /CREATIVE_CINEMATIC_CONTINUITY_CONFLICT:/);
  assert.match(gate, /if \(text\(task\.status\)\.toUpperCase\(\) === "FAILED"\) return task/);
});

test("Cinema continuity intelligence inherits omissions and classifies visual-state categories", () => {
  const gate = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityConflictGate.js",
  );

  assert.match(gate, /status:\s*"INHERIT"/);
  assert.match(gate, /omitted_planned_state_inherits_reviewed_state:\s*true/);
  assert.match(gate, /explicit_conflicting_state_requires_story_authority:\s*true/);
  assert.match(gate, /"identity"/);
  assert.match(gate, /"wardrobe"/);
  assert.match(gate, /"hair_makeup"/);
  assert.match(gate, /"products"/);
  assert.match(gate, /"props"/);
  assert.match(gate, /"location"/);
  assert.match(gate, /"lighting"/);
  assert.match(gate, /"spatial_orientation"/);
  assert.match(gate, /cinematic_continuity_resolution/);
  assert.match(gate, /resolved_state:\s*resolved/);
});

test("Cinema intentional continuity changes require category-scoped story authority", () => {
  const gate = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityConflictGate.js",
  );

  assert.match(gate, /const MIN_REASON_LENGTH = 12;/);
  assert.match(gate, /intentional_continuity_changes/);
  assert.match(gate, /sceneContext\.state_change/);
  assert.match(gate, /sceneContext\.transition_logic/);
  assert.match(gate, /inferCategoriesFromText/);
  assert.match(gate, /authorizationFor\(authorizations, category\)/);
  assert.match(gate, /authorized_intentional_change/);
  assert.match(gate, /intentional_change_categories/);
  assert.match(gate, /cross_scene_identity_continuity_enforced_when_identity_matches:\s*true/);
  assert.match(gate, /same_scene_environment_continuity_enforced:\s*true/);
});

test("owned Cinema receives only continuity-gate-approved resolved state", () => {
  const transport = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCinematicStateMemoryBootstrap.js",
  );

  assert.match(transport, /CREATIVE_CINEMATIC_CONTINUITY_RESOLUTION_V1/);
  assert.match(transport, /CREATIVE_CINEMATIC_CONTINUITY_CONFLICT_GATE_V1/);
  assert.match(transport, /AVANTIQO_VIDEO_CINEMATIC_CONTINUITY_GATE_NOT_PASSED/);
  assert.match(transport, /resolved_cinematic_state:\s*compact\(resolved\)/);
  assert.match(transport, /cinematic_continuity_resolution_bound:\s*Boolean\(resolved\)/);
  assert.match(transport, /cinematic_continuity_gate_analysis_hash/);
  assert.match(transport, /cinematic_continuity_gate_passed:\s*true/);
});

test("server and local Creative runtimes both install the Cinema continuity conflict gate", () => {
  const instrumentation = source("instrumentation.js");
  const localBootstrap = source("scripts/creative-runtime-bootstrap.mjs");

  for (const runtime of [instrumentation, localBootstrap]) {
    assert.match(runtime, /CreativeCinematicContinuityConflictGate/);
    assert.match(runtime, /CreativeCinematicStateMemoryBootstrap/);
    assert.match(runtime, /AvantiqoVideoCinematicStateMemoryBootstrap/);
  }
});
