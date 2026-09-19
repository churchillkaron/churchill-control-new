import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/operator/runtime/IntelligenceAdaptiveLearningRuntime.js", import.meta.url),
  "utf8",
);

test("adaptive learning narrows recent execution reads", () => {
  assert.match(source, /status:execution->>status/);
  assert.match(source, /capability_nested_key:execution->capability->>key/);
  assert.match(source, /reason:execution->>reason/);
  assert.match(source, /error:execution->>error/);
  assert.match(source, /action_call_completed:execution->action_call_completed/);
  assert.match(source, /business_effect_verified:execution->business_effect_verified/);
  assert.doesNotMatch(source, /select\("execution,conversation_id"\)/);
});

test("adaptive learning preserves bounded failure matching", () => {
  assert.match(source, /\.limit\(120\)/);
  assert.match(source, /observeVerifiedExecutionFailure\(\{/);
  assert.match(source, /item\.observation\?\.fingerprint === observation\.fingerprint/);
});
