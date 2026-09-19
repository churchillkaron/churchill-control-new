import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const queue=fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");

test("governed video remains waiting until Image Studio production authority is complete",()=>{
  assert.match(queue,/governedVideoTask/);
  assert.match(queue,/CreativeImagePrevisualizationAuthorityRuntime\.evaluate/);
  assert.match(queue,/CreativeImageProductionPackageRuntime\.build/);
  assert.match(queue,/CreativeImageShotReadyRuntime\.evaluate/);
  assert.match(queue,/IMAGE_STUDIO_VIDEO_PACKAGE_PENDING/);
  assert.match(queue,/retryable: true/);
});

test("readiness hold preserves failure evidence instead of failing the video task",()=>{
  assert.match(queue,/previsualization_failures/);
  assert.match(queue,/production_package_failures/);
  assert.match(queue,/shot_ready_failures/);
  const block=queue.slice(
    queue.indexOf("IMAGE_STUDIO_VIDEO_PACKAGE_PENDING")-1000,
    queue.indexOf("IMAGE_STUDIO_VIDEO_PACKAGE_PENDING")+1000,
  );
  assert.doesNotMatch(block,/ProductionTaskRuntime\.fail/);
});
