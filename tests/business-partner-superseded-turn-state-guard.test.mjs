import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");

test("superseded live turn is detected before assistant conversation-state persistence", () => {
  assert.match(route, /loadAvantiqoLiveExecution/);
  assert.match(route, /const supersededByNewerExecution = !\(await operatorLiveExecutionStillCurrent\(\{/);
  assert.match(route, /text\(current\?\.live_execution\?\.execution_id\) === expectedExecutionId/);
  const check = route.indexOf("const supersededByNewerExecution = !(await operatorLiveExecutionStillCurrent({");
  const persist = route.indexOf("const assistantPersistPromise", check);
  assert.ok(check >= 0 && persist > check);
});

test("superseded assistant turn preserves transcript but cannot overwrite agreement or project state", () => {
  assert.match(route, /supersededByNewerExecution[\s\S]*persistIntelligenceTurn\(\{/);
  assert.match(route, /role: "assistant"/);
  assert.match(route, /conversation_state_mutation_performed: false/);
  assert.match(route, /superseded_live_execution: true/);
  assert.match(route, /paired_user_turn_id: persistedUserTurn\?\.id \|\| null/);
});

test("superseded turn cannot promote stale project state into durable memory", () => {
  assert.match(route, /supersededByNewerExecution[\s\S]*SUPERSEDED_LIVE_EXECUTION/);
  assert.match(route, /long_term_learning_performed: false/);
});

test("superseded response returns latest persisted conversation state instead of stale proposed state", () => {
  assert.match(route, /loadIntelligenceConversationSnapshot\(\{/);
  assert.match(route, /agreement_state: object\(persistedState\.agreement_state\)/);
  assert.match(route, /project_state: object\(persistedState\.project_state\)/);
});
