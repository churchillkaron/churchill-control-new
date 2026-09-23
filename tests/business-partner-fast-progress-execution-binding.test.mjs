import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");

test("fast conversation recovery progress binds to the exact live execution", () => {
  assert.match(source, /publishFastConversationRecovery\(\{ organizationId, partyId, actor, callerRequest \}/);
  assert.match(source, /callerRequest\?\.headers\?\.get\?\.\("x-avantiqo-live-execution-id"\)/);
  assert.match(source, /publishAvantiqoLiveExecution\(\{[\s\S]*executionId,[\s\S]*FAST_INTELLIGENCE_RETRY/);
});

test("product inspection progress also binds to the current execution", () => {
  assert.match(source, /if \(executionId\) await live\.publishAvantiqoLiveExecution\(\{[\s\S]*executionId,[\s\S]*PRODUCT_INSPECTION_EVIDENCE/);
});
