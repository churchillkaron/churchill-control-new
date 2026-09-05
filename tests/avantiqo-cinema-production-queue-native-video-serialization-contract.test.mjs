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

test("dispatchAll claims the mastered native Video lane when one is already running", () => {
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
    /let masteredVideoLaneClaimed = masteredVideoRunningAtStart\.length > 0/,
  );
});

test("dispatchAll allows at most one new mastered native Video dispatch per request", () => {
  const dispatchAllStart = queueRuntime.indexOf("async dispatchAll");
  const dispatchNextStart = queueRuntime.indexOf("async dispatchNext", dispatchAllStart);
  const dispatchAllBody = queueRuntime.slice(dispatchAllStart, dispatchNextStart);

  assert.match(
    dispatchAllBody,
    /skipMasteredVideo:\s*masteredVideoLaneClaimed/,
  );
  assert.match(
    dispatchAllBody,
    /if \(isMasteredNativeVideoTask\(next\)\)/,
  );
  assert.match(
    dispatchAllBody,
    /masteredVideoLaneClaimed = true/,
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

test("queue exposes serialization evidence for production audits", () => {
  assert.match(
    queueRuntime,
    /dispatch_policy:\s*\{/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_serialized:\s*true/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_running_at_start/,
  );
  assert.match(
    queueRuntime,
    /mastered_native_video_dispatched_task_id/,
  );
});
