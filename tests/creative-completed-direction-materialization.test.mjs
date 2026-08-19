import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const RUNTIME =
  "lib/creative/director/runtime/CreativeCompletedDirectionMaterializationRuntime.js";
const ROUTE = "app/api/creative/pipeline/route.js";
const ORCHESTRATOR =
  "lib/creative/director/orchestrator/CreativePipelineOrchestrator.js";

test("pipeline materialization is bound to one completed governed direction job", async () => {
  const [runtime, route, orchestrator] = await Promise.all([
    fs.readFile(RUNTIME, "utf8"),
    fs.readFile(ROUTE, "utf8"),
    fs.readFile(ORCHESTRATOR, "utf8"),
  ]);

  assert.match(runtime, /CREATIVE_COMPLETED_DIRECTION_MATERIALIZATION_V2/);
  assert.match(runtime, /CreativeExecutionJobRepository\.getById/);
  assert.match(runtime, /PROJECT_DIRECTION/);
  assert.match(runtime, /COMPLETED/);
  assert.match(runtime, /DIRECTION_JOB_CONTRACT/);
  assert.match(runtime, /CREATIVE_DIRECTION_RESULT_HASH_MISMATCH/);
  assert.match(runtime, /CREATIVE_DIRECTION_RESULT_APPROVAL_MISMATCH/);
  assert.match(runtime, /CREATIVE_DIRECTION_RESULT_RESEARCH_MISMATCH/);
  assert.match(runtime, /CREATIVE_DIRECTION_PROJECT_DURATION_MISMATCH/);
  assert.match(runtime, /ProductionGraphRepository\.listByProject/);
  assert.match(runtime, /ProductionTaskRuntime\.list/);
  assert.match(runtime, /CREATIVE_PROJECT_ALREADY_MATERIALIZED/);
  assert.match(runtime, /CreativeExecutionJobRepository\.enqueue/);
  assert.match(runtime, /creative-project-direction-materialization-v2/);
  assert.match(runtime, /PROJECT_DIRECTION_MATERIALIZATION/);
  assert.match(runtime, /CREATIVE_PROJECT_MATERIALIZATION_ALREADY_RESERVED/);
  assert.match(runtime, /CreativeExecutionJobRepository\.complete/);
  assert.match(runtime, /CreativeExecutionJobRepository\.retry/);
  assert.match(runtime, /master:\s*directionResult/);
  assert.match(runtime, /direction_rerun_performed:\s*false/);
  assert.match(runtime, /media_generation_authorized:\s*false/);
  assert.match(runtime, /provider_execution_started:\s*false/);
  assert.match(runtime, /publication_authorized:\s*false/);

  assert.match(route, /MATERIALIZE_COMPLETED_DIRECTION/);
  assert.match(route, /action required/);
  assert.doesNotMatch(
    route,
    /body\.action\s*\|\|\s*["']MATERIALIZE_COMPLETED_DIRECTION["']/,
  );
  assert.match(route, /direction_job_id required/);
  assert.match(route, /CreativeCompletedDirectionMaterializationRuntime\.materialize/);
  assert.doesNotMatch(route, /buildCreativePipeline\(/);

  assert.match(
    orchestrator,
    /CREATIVE_GOVERNED_MASTER_REQUIRED_FOR_MATERIALIZATION/,
  );
  assert.doesNotMatch(
    orchestrator,
    /CreativeUniversalTemporalDirectionRuntime/,
  );
  assert.doesNotMatch(
    orchestrator,
    /master\s*\|\|\s*await/,
  );
});
