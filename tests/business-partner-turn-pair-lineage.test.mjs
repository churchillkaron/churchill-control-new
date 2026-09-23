import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");

test("every normal Business Partner assistant turn is bound to the exact persisted user turn", () => {
  assert.match(route, /const persistedDecision = \{[\s\S]*paired_user_turn_id: text\(persistedUserTurn\?\.id\) \|\| null/);
  assert.match(route, /decision: persistedDecision/);
});

test("superseded and governed failure paths retain exact user-turn pairing too", () => {
  assert.match(route, /paired_user_turn_id: persistedUserTurn\?\.id \|\| null/);
  assert.match(route, /diagnosis_failure_pair: \{ user_turn_id: text\(pairedUserTurnId\)/);
});
