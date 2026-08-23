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

test("Cinema auto-repair restores only reviewed authoritative continuity before GPU spend", () => {
  const repair = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityAutoRepairBootstrap.js",
  );

  assert.match(repair, /CREATIVE_CINEMATIC_CONTINUITY_AUTO_REPAIR_V1/);
  assert.match(repair, /CREATIVE_CINEMATIC_CONTINUITY_CONFLICT:/);
  assert.match(repair, /CREATIVE_CINEMATIC_STATE_LEDGER_V1/);
  assert.match(repair, /stateForConflict/);
  assert.match(repair, /source_state_hashes/);
  assert.match(repair, /source_chain_hashes/);
  assert.match(repair, /restore_only_reviewed_authoritative_state:\s*true/);
  assert.match(repair, /do_not_invent_visual_state:\s*true/);
  assert.match(repair, /pre_gpu:\s*true/);
  assert.match(repair, /provider_calls_added:\s*0/);
  assert.match(repair, /gpu_spend_added:\s*0/);
});

test("Cinema continuity auto-repair never mutates canonical Shot or Storyboard truth", () => {
  const repair = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityAutoRepairBootstrap.js",
  );

  assert.match(repair, /const repaired = clone\(shot\)/);
  assert.doesNotMatch(repair, /ShotRepository\.update\(/);
  assert.match(repair, /canonical_shot_mutated:\s*false/);
  assert.match(repair, /canonical_story_mutated:\s*false/);
  assert.match(repair, /do_not_mutate_shot_bible:\s*true/);
  assert.match(repair, /do_not_mutate_storyboard:\s*true/);
  assert.match(repair, /execution_contract_only:\s*true/);
});

test("Cinema auto-repair covers governed visual-state categories and preserves non-conflicting direction", () => {
  const repair = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityAutoRepairBootstrap.js",
  );

  for (const category of [
    "identity",
    "wardrobe",
    "hair_makeup",
    "products",
    "props",
    "location",
    "lighting",
    "spatial_orientation",
  ]) {
    assert.match(repair, new RegExp(`"${category}"`));
  }
  assert.match(repair, /replaceOrientation/);
  assert.match(repair, /preserve_non_conflicting_direction:\s*true/);
  assert.match(repair, /intentional_story_changes_preserved:\s*true/);
});

test("Cinema auto-repair must pass the same conflict gate before provider execution is unblocked", () => {
  const repair = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityAutoRepairBootstrap.js",
  );
  const gate = source(
    "lib/creative/continuity/runtime/CreativeCinematicContinuityConflictGate.js",
  );
  const transport = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCinematicStateMemoryBootstrap.js",
  );

  assert.match(repair, /CreativeCinematicContinuityConflictGate\.evaluateContinuity/);
  assert.match(repair, /if \(repairedEvaluation\.passed !== true\) return null/);
  assert.match(repair, /revalidated_with_same_conflict_gate:\s*true/);
  assert.match(repair, /provider_submission_unblocked_after_continuity_repair:\s*true/);
  assert.match(repair, /gpu_spend_unblocked_after_continuity_repair:\s*true/);
  assert.match(repair, /return failWithoutAutoRepair\(id, error, output\)/);
  assert.match(gate, /provider_submission_blocked:\s*true/);
  assert.match(gate, /gpu_spend_blocked:\s*true/);
  assert.match(transport, /AVANTIQO_VIDEO_CINEMATIC_CONTINUITY_GATE_NOT_PASSED/);
});

test("server and local Creative runtimes install Cinema auto-repair after the conflict gate", () => {
  const instrumentation = source("instrumentation.js");
  const localBootstrap = source("scripts/creative-runtime-bootstrap.mjs");

  for (const runtime of [instrumentation, localBootstrap]) {
    const conflict = runtime.indexOf("CreativeCinematicContinuityConflictGate");
    const repair = runtime.indexOf("CreativeCinematicContinuityAutoRepairBootstrap");
    const transport = runtime.indexOf("AvantiqoVideoCinematicStateMemoryBootstrap");
    assert.ok(conflict >= 0);
    assert.ok(repair > conflict);
    assert.ok(transport > repair);
  }
});
