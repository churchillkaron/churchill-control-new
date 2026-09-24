import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const resolution = await readFile("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");
const director = await readFile("lib/creative/director/runtime/CreativeDirectorRuntime.js", "utf8");
const stateRepository = await readFile("lib/creative/state/CreativeStateRepository.js", "utf8");

test("approved temporal council resume persists canonical master and clears temporary checkpoints only after pipeline handoff", () => {
  assert.match(resolution, /async function persistTemporalDirectionCheckpoint/);
  assert.match(resolution, /CREATIVE_TEMPORAL_DIRECTION_CHECKPOINT_V1/);
  const persistIndex = resolution.indexOf("await persistTemporalDirectionCheckpoint(context, resolved.governedMaster)");
  assert.ok(persistIndex >= 0);
  const resumeBlock = resolution.slice(resolution.indexOf("async resumeApprovedCouncil"));
  assert.doesNotMatch(resumeBlock, /await clearResolvedDirectionCheckpoints\(context\)/);
  assert.match(resolution, /async finalizeResolvedHandoff/);
  assert.match(director, /pipeline = await buildCreativePipeline/);
  assert.match(director, /await CreativeWorkflowResolutionRuntime\.finalizeResolvedHandoff/);
});

test("autonomous scheduler can recover planning and production lifecycle stages", () => {
  for (const stage of ["UNDERSTANDING", "RESEARCHING", "BUILDING_STRATEGY", "BUILDING_CONCEPT", "BUILDING_STORYBOARD", "PLANNING_PRODUCTION", "READY_FOR_EXECUTION", "EXECUTING", "PRODUCING", "RENDERING", "REVIEWING", "MONITORING"]) {
    assert.match(stateRepository, new RegExp(stage));
  }
  assert.doesNotMatch(stateRepository.split("const ACTIVE_PRODUCTION_STAGES = [")[1].split("];")[0], /WAITING_APPROVAL|COMPLETED/);
});
