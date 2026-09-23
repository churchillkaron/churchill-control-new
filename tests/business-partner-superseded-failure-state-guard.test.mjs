import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");

test("live execution currentness check is centralized and fail-closed", () => {
  assert.match(route, /async function operatorLiveExecutionStillCurrent/);
  assert.match(route, /return current\?\.found === true/);
  assert.match(route, /return false;/);
});

test("superseded governed diagnosis failure persists transcript without state mutation", () => {
  assert.match(route, /stateMutationAllowed = true/);
  assert.match(route, /if \(!stateMutationAllowed\) \{[\s\S]*persistIntelligenceTurn\(\{/);
  assert.match(route, /superseded_live_execution: true/);
  assert.match(route, /conversation_state_mutation_performed: false/);
});

test("both operator-error and proof-rejection failure persistence use currentness", () => {
  assert.match(route, /const failureStateMutationAllowed = await operatorLiveExecutionStillCurrent/);
  assert.match(route, /stateMutationAllowed: failureStateMutationAllowed/);
  assert.match(route, /stateMutationAllowed: !supersededByNewerExecution/);
});
