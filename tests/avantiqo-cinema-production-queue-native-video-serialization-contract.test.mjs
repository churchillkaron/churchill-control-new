import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const queueRuntime = fs.readFileSync(
  "lib/creative/production/queue/runtime/ProductionQueueRuntime.js",
  "utf8",
);
const readinessRuntime = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionReadinessRuntime.js",
  "utf8",
);

test("production queue derives mastered native Video classification from the governed readiness capability set", () => {
  assert.match(
    queueRuntime,
    /CREATIVE_VIDEO_MASTERED_CAPABILITIES/,
  );
  assert.match(
    queueRuntime,
    /function isMasteredNativeVideoTask\(task = \{\}\)/,
  );
  assert.match(
    queueRuntime,
    /CREATIVE_VIDEO_MASTERED_CAPABILITIES\.has\(productionCapability\(task\)\)/,
  );
  assert.match(
    readinessRuntime,
    /"ai\.video\.generate"/,
  );
  assert.match(
    readinessRuntime,
    /"ai\.video\.image_to_video"/,
  );
  assert.match(
    readinessRuntime,
    /"ai\.video\.first_last_frame_to_video"/,
  );
});

test("dispatchAll counts already-running mastered native Video lanes", () => {
  assert.match(
    queueRuntime,
    /const initialQueue = await this\.build\(input\)/,
  );
  assert.match(
    queueRuntime,
    /initialQueue\.running\.filter\(isMasteredNativeVideoTask\)/,
  );
  assert.match(
    queueRuntime,
    /let masteredVideoRunningCount = masteredVideoRunningAtStart\.length/,
  );
});

test("dispatchAll enforces bounded mastered native Video concurrency", () => {
  const dispatchAllStart = queueRuntime.indexOf("async dispatchAll");
  const dispatchNextStart = queueRuntime.indexOf("async dispatchNext", dispatchAllStart);
  const dispatchAllBody = queueRuntime.slice(dispatchAllStart, dispatchNextStart);

  assert.match(
    dispatchAllBody,
    /skipMasteredVideo:\s*masteredVideoRunningCount >= masteredVideoLaneLimit/,
  );
  assert.match(
    dispatchAllBody,
    /if \(isMasteredNativeVideoTask\(next\)\)/,
  );
  assert.match(
    dispatchAllBody,
    /masteredVideoRunningCount \+= 1/,
  );
  assert.match(
    dispatchAllBody,
    /mastered_native_video_dispatch_count:\s*\n\s*dispatched\.filter\(isMasteredNativeVideoTask\)\.length/,
  );
});

test("dispatchNext skips mastered Video without blocking unrelated ready work", () => {
  const dispatchNextStart = queueRuntime.indexOf("async dispatchNext");
  const dispatchNextBody = queueRuntime.slice(dispatchNextStart);

  assert.match(
    dispatchNextBody,
    /skipMasteredVideo = false/,
  );
  assert.match(
    dispatchNextBody,
    /queue\.ready\.filter\(\(task\) => !isMasteredNativeVideoTask\(task\)\)/,
  );
  assert.match(
    dispatchNextBody,
    /const eligible = skipMasteredVideo[\s\S]*?: queue\.ready/,
  );
  assert.match(
    dispatchNextBody,
    /Number\(left\.priority \|\| 100\) - Number\(right\.priority \|\| 100\)/,
  );
});

test("queue exposes bounded concurrency evidence for production audits", () => {
  assert.match(
    queueRuntime,
    /dispatch_policy:\s*\{/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_serialized:\s*false/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_concurrency_limit/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_running_at_start/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_dispatched_task_ids/,
  );
});
