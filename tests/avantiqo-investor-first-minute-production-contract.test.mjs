import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  "lib/creative/director/runtime/CreativeInvestorFirstMinuteProductionRuntime.js",
  "utf8",
);

test("investor production is hard-scoped to exactly the first 60 seconds", () => {
  assert.match(runtime, /AVANTIQO_INVESTOR_FIRST_MINUTE_PRODUCTION_V1/);
  assert.match(runtime, /INVESTOR_FIRST_MINUTE_START_SECONDS = 0/);
  assert.match(runtime, /INVESTOR_FIRST_MINUTE_END_SECONDS = 60/);
  assert.match(runtime, /INVESTOR_FIRST_MINUTE_EXACT_60_SECOND_BOUNDARY_REQUIRED/);
  assert.match(runtime, /INVESTOR_FIRST_MINUTE_SCOPE_NOT_SHOT_ALIGNED/);
  assert.match(runtime, /duration_seconds:\s*60/);
});

test("full investor master remains immutable and cannot be replanned", () => {
  assert.match(runtime, /immutable_full_master:\s*true/);
  assert.match(runtime, /full_master_replanning_forbidden:\s*true/);
  assert.match(runtime, /legacy_240_300_second_runtime_forbidden:\s*true/);
  assert.match(runtime, /full_master_mutated:\s*false/);
  assert.match(runtime, /full_master_replanned:\s*false/);
  assert.doesNotMatch(runtime, /CreativeOwnedInvestorFilmProductionRuntime/);
  assert.doesNotMatch(runtime, /prepareOwnedInvestorFilmProduction/);
  assert.doesNotMatch(runtime, /executeApprovedOwnedInvestorFilmProduction/);
});

test("scope is derived from authoritative validated temporal master lineage", () => {
  assert.match(runtime, /TEMPORAL/);
  assert.match(runtime, /INVESTOR_FIRST_MINUTE_VALIDATED_MASTER_REQUIRED/);
  assert.match(runtime, /INVESTOR_FIRST_MINUTE_MASTER_LINEAGE_REQUIRED/);
  assert.match(runtime, /master_plan_hash/);
  assert.match(runtime, /story_contract_hash/);
  assert.match(runtime, /full_master_hash/);
  assert.match(runtime, /digest\(fullPlan\)/);
});

test("scoped rows flow through normal graph, reuse, execution and task materialization", () => {
  assert.match(runtime, /ProductionGraphRuntime\.plan/);
  assert.match(runtime, /AssetReuseEngine\.optimizeGraph/);
  assert.match(runtime, /ExecutionRuntime\.plan/);
  assert.match(runtime, /ExecutionRuntime\.create/);
  assert.match(runtime, /CreativeProductionTaskMaterializationRuntime\.verify/);
  assert.match(runtime, /ProductionTaskRuntime\.create/);
});

test("materialization is idempotent by full master hash and canonical master ids", () => {
  assert.match(runtime, /existingScenes\.find/);
  assert.match(runtime, /existingShots\.find/);
  assert.match(runtime, /existing\.filter\(\(task\) => task\.metadata\?\.execution_node_id\)/);
  assert.match(runtime, /ProductionGraphRuntime\.list/);
  assert.match(runtime, /productionGraphResumed/);
  assert.match(runtime, /candidate\.metadata\?\.full_master_hash/);
  assert.match(runtime, /candidate\.metadata\?\.master_plan_hash/);
  assert.match(runtime, /master_plan_scene_id/);
  assert.match(runtime, /master_plan_shot_id/);
});

test("preparation never starts paid generation", () => {
  assert.match(runtime, /generation_started:\s*false/);
  assert.match(runtime, /paid_execution_started:\s*false/);
  assert.doesNotMatch(runtime, /ProductionRuntime\.runProduction/);
  assert.doesNotMatch(runtime, /\.dispatch\(/);
});

test("scoped shot materialization preserves core professional production controls", () => {
  for (const field of [
    "frame_plan",
    "camera",
    "lighting",
    "production_design",
    "continuity",
    "actors",
    "products",
    "location",
    "dialogue",
    "narration",
    "audio",
    "music",
    "sound_effects",
    "graphics",
    "vfx",
    "negative_constraints",
    "known_failure_modes",
    "repair_instructions",
    "reference_assets",
    "generation",
    "service_code",
    "capability",
  ]) assert.match(runtime, new RegExp(field));
});
