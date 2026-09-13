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

test("fallback failure scan avoids unused turn timestamp payload", () => {
  assert.match(runtime, /\.select\("execution,conversation_id"\)/);
  assert.doesNotMatch(runtime, /\.select\("execution,created_at,conversation_id"\)/);
});
