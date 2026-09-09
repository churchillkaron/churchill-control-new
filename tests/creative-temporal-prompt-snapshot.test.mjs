import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("temporal direction sends creative-only project and mission snapshots to Deep", () => {
  assert.match(source, /function creativeProjectPromptSnapshot/);
  assert.match(source, /function creativeMissionPromptSnapshot/);
  assert.match(source, /const promptMission = creativeMissionPromptSnapshot\(mission\)/);
  assert.match(source, /const promptProject = creativeProjectPromptSnapshot\(project\)/);
  assert.match(source, /project: promptProject/);
  assert.doesNotMatch(source, /paid_direction_approval/);
  assert.doesNotMatch(source, /spent_customer_price/);
  assert.doesNotMatch(source, /wallet_settlement/);
});
