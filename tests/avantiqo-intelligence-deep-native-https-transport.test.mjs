import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");

test("Deep Intelligence uses the owned local queue instead of a native external HTTPS transport", () => {
  assert.match(provider, /executeIntelligenceLocalQueue/);
  assert.match(queue, /const TRANSPORT = "supabase-pull-queue-v1"/);
  assert.match(queue, /local-intelligence:/);
  assert.doesNotMatch(provider, /api\.runpod\.ai|fetch\(.*https|RUNPOD_API_KEY/);
});
