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

test("Cinema publishes only reviewed approved visual state into a hash-chained ledger", () => {
  const memory = source(
    "lib/creative/continuity/runtime/CreativeCinematicStateMemoryBootstrap.js",
  );

  assert.match(memory, /CREATIVE_CINEMATIC_STATE_MEMORY_V1/);
  assert.match(memory, /CREATIVE_CINEMATIC_STATE_LEDGER_V1/);
  assert.match(memory, /review\.review\?\.approved !== true/);
  assert.match(memory, /automated_perceptual_validation_passed !== true/);
  assert.match(memory, /generated_media_released_for_downstream !== true/);
  assert.match(memory, /approved_for_downstream_after_perceptual_review !== true/);
  assert.match(memory, /endpointExpected && endpoint\.passed !== true/);
  assert.match(memory, /reviewed_only:\s*true/);
  assert.match(memory, /failed_generation_excluded:\s*true/);
  assert.match(memory, /superseded_generation_excluded:\s*true/);
  assert.match(memory, /previous_authoritative_state_hash/);
  assert.match(memory, /previous_authoritative_chain_hash/);
  assert.match(memory, /chain_hash:\s*hash\(/);
});

test("Cinema reviewed state retains identity wardrobe environment spatial and endpoint provenance", () => {
  const memory = source(
    "lib/creative/continuity/runtime/CreativeCinematicStateMemoryBootstrap.js",
  );

  assert.match(memory, /wardrobe:\s*list\(sourceData\.wardrobe\)/);
  assert.match(memory, /hair_makeup:\s*list\(sourceData\.hair_makeup\)/);
  assert.match(memory, /props:\s*list\(sourceData\.props\)/);
  assert.match(memory, /location:\s*object\(shot\.location\)/);
  assert.match(memory, /production_design:\s*object\(shot\.production_design\)/);
  assert.match(memory, /continuity:\s*object\(shot\.continuity\)/);
  assert.match(memory, /camera:\s*object\(shot\.camera\)/);
  assert.match(memory, /lighting:\s*object\(shot\.lighting\)/);
  assert.match(memory, /frame_plan:\s*object\(shot\.frame_plan\)/);
  assert.match(memory, /first_frame_binding_hash:\s*hash\(/);
  assert.match(memory, /last_frame_binding_hash:\s*hash\(/);
  assert.match(memory, /opening_similarity/);
  assert.match(memory, /closing_similarity/);
  assert.match(memory, /source_video_sha256/);
});

test("later Cinema shots inherit bounded relevant approved memory and expose gaps", () => {
  const memory = source(
    "lib/creative/continuity/runtime/CreativeCinematicStateMemoryBootstrap.js",
  );

  assert.match(memory, /const MAX_RELEVANT_STATES = 3;/);
  assert.match(memory, /const MAX_HASH_HISTORY = 24;/);
  assert.match(memory, /latestSameScene/);
  assert.match(memory, /identityMatches/);
  assert.match(memory, /authoritative_states/);
  assert.match(memory, /approved_state_hash_history/);
  assert.match(memory, /unpublished_prior_shot_ids/);
  assert.match(memory, /failed_or_superseded_outputs_excluded:\s*true/);
  assert.match(memory, /mutable_planning_state_not_authoritative:\s*true/);
  assert.match(memory, /do_not_rewrite_approved_neighbors:\s*true/);
  assert.match(memory, /input:\s*\{[\s\S]*cinematic_state_memory:\s*ledger/);
});

test("owned Cinema receives compact reviewed state through cinematic control transport", () => {
  const transport = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoCinematicStateMemoryBootstrap.js",
  );
  const provider = source(
    "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProvider.js",
  );
  const worker = source("services/avantiqo-video-engine/handler.py");

  assert.match(transport, /AVANTIQO_CINEMATIC_STATE_MEMORY_TRANSPORT_V1/);
  assert.match(transport, /CREATIVE_CINEMATIC_STATE_LEDGER_V1/);
  assert.match(transport, /source_state:\s*\{/);
  assert.match(transport, /identity:\s*latest\.identity/);
  assert.match(transport, /environment:\s*latest\.environment/);
  assert.match(transport, /spatial:\s*latest\.spatial/);
  assert.match(transport, /endpoint_lineage:\s*latest\.endpoint_lineage/);
  assert.match(transport, /cinematic_state_memory:\s*memory/);
  assert.match(transport, /cinematic_state_preservation_required:\s*true/);
  assert.match(transport, /cinematic_state_memory_bound:\s*true/);
  assert.match(transport, /cinematic_state_memory_source_state_hash/);
  assert.match(provider, /shot_specification:\s*shot/);
  assert.match(provider, /continuity:\s*object\(/);
  assert.match(worker, /"shot_specification": _object\(control\.get\("shot_specification"\)\)/);
  assert.match(worker, /"continuity": _object\(control\.get\("continuity"\)\)/);
  assert.match(worker, /AVANTIQO_VIDEO_CINEMATIC_CONTROL_TOO_LARGE/);
});

test("server and local Creative runtimes install cinematic memory and owned transport", () => {
  const instrumentation = source("instrumentation.js");
  const localBootstrap = source("scripts/creative-runtime-bootstrap.mjs");
  for (const runtime of [instrumentation, localBootstrap]) {
    assert.match(runtime, /CreativeCinematicStateMemoryBootstrap/);
    assert.match(runtime, /AvantiqoVideoCinematicStateMemoryBootstrap/);
  }
});
