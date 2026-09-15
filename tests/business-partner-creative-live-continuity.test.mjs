import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Business Partner sends turns through the live execution wrapper and renders runtime wording verbatim", () => {
  const home = source("components/operator/HomeAvantiqoIntelligence.jsx");
  assert.match(home, /"\/api\/operator\/turn\/live"/);
  assert.match(home, /if \(description\) \{\s*return description;\s*\}/);
  assert.doesNotMatch(home, /return `\$\{description\}.*capability/);
});

test("Creative project inspection exposes the canonical workflow checkpoint state", () => {
  const inspect = source("lib/creative/studio/capabilities/inspectStudioProject.js");
  assert.match(inspect, /CreativeStateEngine\.get/);
  assert.match(inspect, /workflow_stage/);
  assert.match(inspect, /workflow_updated_at/);
  assert.match(inspect, /execution_locked/);
  assert.match(inspect, /execution_locked_at/);
});

test("Active Creative process questions bypass stale fast-chat state and force governed live inspection", () => {
  const fast = source("lib/operator/runtime/OperatorFastConversationRuntime.js");
  assert.match(fast, /CREATIVE_PROCESS_QUERY_PATTERN/);
  assert.match(fast, /projectState = \{\}/);
  assert.match(fast, /activeCreativeProjectId && CREATIVE_PROCESS_QUERY_PATTERN\.test\(clean\)/);
});

test("Business Partner durable project continuity carries Creative workflow state into cognition", () => {
  const state = source("lib/operator/contracts/OperatorProjectState.js");
  const cognition = source("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
  assert.match(state, /workflow_stage: text\(candidate\.workflow_stage/);
  assert.match(state, /execution_locked: candidate\.execution_locked === true/);
  assert.match(state, /context\.workflow_stage \? `stage=\$\{context\.workflow_stage\}`/);
  assert.match(cognition, /creative_context: text\(creative\.creative_project_id/);
  assert.match(cognition, /current_state_requires_live_read: true/);
  assert.match(cognition, /last_direction_checkpoint_status/);
});
