import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fast = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js", import.meta.url), "utf8");

test("strong read matches bypass 30B routing and present evidence through front lane", () => {
  assert.match(bridge, /direct_read_recommended/);
  assert.match(bridge, /primary_capability_key/);
  assert.match(fast, /directReadRecommended/);
  assert.match(fast, /readTool\.execute\(\{ capability_key: directReadKey, payload: \{\} \}\)/);
  assert.match(fast, /FRONT_VERIFIED_EVIDENCE_PRESENTATION/);
  assert.match(fast, /deterministic_direct_read: true/);
});

test("evidence timeout returns a persistent front answer instead of a second long retry", () => {
  assert.match(fast, /persistent answer instead of making you wait through another long retry/);
  assert.match(fast, /FRONT_EVIDENCE_TIMEOUT_FALLBACK/);
  assert.match(fast, /persistent_timeout_fallback: true/);
  assert.match(fast, /verification_incomplete: true/);
  assert.doesNotMatch(fast, /liveReadReceipts\.length = 0;[\s\S]{0,180}evidenceExecution = await runEvidenceTurn\(\)/);
});
