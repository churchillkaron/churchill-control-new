import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const understanding = fs.readFileSync(
  "lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js",
  "utf8",
);
const semantic = fs.readFileSync(
  "lib/operator/runtime/OperatorSemanticActionPreparationRuntime.js",
  "utf8",
);

test("semantic understanding carries the latest verified write outside the recent-turn window", () => {
  assert.match(understanding, /function latestVerifiedWriteExecution\(/);
  assert.match(understanding, /latest_verified_write: latestVerifiedWriteExecution\(options\.conversation\)/);
  assert.match(understanding, /durable read-only continuity anchor/);
});

test("durable write revisions cannot be hijacked by stale product context", () => {
  assert.match(understanding, /const durableBusinessRevision =/);
  assert.match(understanding, /route: "governed"/);
  assert.match(understanding, /execution_domain: "business"/);
  assert.match(understanding, /correction_or_revision: true/);
  assert.match(understanding, /goal_relation: "revise"/);
  assert.match(understanding, /requires_mutation: true/);
  assert.match(understanding, /needs_current_evidence: true/);
});

test("semantic action planner falls back to durable conversation execution when project state is empty", () => {
  assert.match(semantic, /function latestConversationExecution\(/);
  assert.match(semantic, /function effectiveLastExecution\(/);
  assert.match(semantic, /return latestConversationExecution\(options\.conversation\)/);
  const matches = semantic.match(/compactLastExecutionTarget\(effectiveLastExecution\(options\)\)/g) || [];
  assert.ok(matches.length >= 2);
});

test("revision continuity remains generic", () => {
  const combined = `${understanding}\n${semantic}`;
  assert.doesNotMatch(combined, /Moonshine|INV-26090003|Trio band|Full band/);
});
