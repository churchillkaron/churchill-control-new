import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const DIRECTOR =
  "lib/creative/director/runtime/CreativeDirectorRuntime.js";
const VIDEO_DISPATCH =
  "lib/creative/video/runtime/CreativeVideoGenerationDispatchRuntime.js";

test("creative director cannot automatically dispatch governed video generation", async () => {
  const [director, videoDispatch] = await Promise.all([
    fs.readFile(DIRECTOR, "utf8"),
    fs.readFile(VIDEO_DISPATCH, "utf8"),
  ]);

  assert.match(director, /function manualVideoGenerationBoundary/);
  assert.match(director, /AWAITING_EXPLICIT_VIDEO_GENERATION/);
  assert.match(director, /automatic_dispatch_allowed:\s*false/);
  assert.match(director, /explicit_start_required:\s*true/);
  assert.match(director, /media_generation_authorized:\s*false/);
  assert.match(director, /publication_authorized:\s*false/);

  const boundaryIndex = director.indexOf("const videoBoundary = manualVideoGenerationBoundary");
  const productionIndex = director.indexOf("ProductionRuntime.runProduction");
  assert.ok(boundaryIndex >= 0, "video boundary must be evaluated");
  assert.ok(productionIndex >= 0, "non-video production path must remain available");
  assert.ok(
    boundaryIndex < productionIndex,
    "video boundary must run before generic production dispatch",
  );

  assert.match(videoDispatch, /CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1/);
  assert.match(videoDispatch, /CREATIVE_VIDEO_DISPATCH_APPROVAL_REQUIRED/);
  assert.match(videoDispatch, /expected_status:\s*PRODUCTION_TASK_STATUS\.WAITING/);
  assert.match(videoDispatch, /ProductionTaskRuntime\.dispatchClaimed/);
});
