import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(
  "lib/operator/runtime/IntelligenceAdaptiveLearningRuntime.js",
  "utf8",
);

test("existing adaptive lessons bypass repeated turn-history scans", () => {
  const lessonLookup = runtime.indexOf('.eq("metadata->>failure_fingerprint", observation.fingerprint)');
  const historyScan = runtime.indexOf('.from("intelligence_turns")', lessonLookup);
  assert.ok(lessonLookup >= 0);
  assert.ok(historyScan > lessonLookup);
  assert.match(runtime, /if \(existingLesson\.data\?\.id\)/);
  assert.match(runtime, /deriveAdaptiveFailureLearning\(\{ observation, existingMetadata \}\)/);
});

test("fallback failure scan uses bounded projected execution fields and no unused timestamp payload", () => {
  assert.match(runtime, /status:execution->>status/);
  assert.match(runtime, /capability_nested_key:execution->capability->>key/);
  assert.match(runtime, /business_effect_verified:execution->business_effect_verified/);
  assert.match(runtime, /\.limit\(120\)/);
  assert.doesNotMatch(runtime, /created_at,/);
});
