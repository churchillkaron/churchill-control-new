import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");

test("all Business Partner semantic classification stages are explicit local-only front cognition", () => {
  assert.match(source, /HUMAN_BUSINESS_PARTNER_CONTEXT_FREE_PREFLIGHT[\s\S]*allow_fast_escalation: false/);
  assert.match(source, /HUMAN_BUSINESS_PARTNER_SEMANTIC_UNDERSTANDING[\s\S]*allow_fast_escalation: false/);
  assert.match(source, /HUMAN_BUSINESS_PARTNER_DELIVERABLE_ARBITER[\s\S]*allow_fast_escalation: false/);
});
