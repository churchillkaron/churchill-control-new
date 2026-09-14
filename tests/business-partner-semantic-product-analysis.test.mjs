import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeHumanBusinessPartnerUnderstanding } from "../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js";

const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");

const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const panel = fs.readFileSync("components/operator/AvantiqoOperator.jsx", "utf8");
const conversationText = fs.readFileSync("components/operator/OperatorConversationText.jsx", "utf8");

function semantic(deliverable, route = "evidence") {
  return normalizeHumanBusinessPartnerUnderstanding({
    route, evidence_scope: "both", reasoning_depth: "deep",
    conversation_mode: "analytical", context_depth: "expanded", response_detail: "deep",
    execution_domain: "product_engineering", engineering_scope: "portfolio",
    engineering_mode: "inspect", engineering_deliverable: deliverable,
    requires_mutation: false, needs_current_evidence: true,
  });
}

test("product analysis keeps inspection as evidence when the human wants conversation", () => {
  const result = semantic("conversation");
  assert.equal(result.route, "evidence");
  assert.equal(result.engineering_deliverable, "conversation");
  assert.equal(result.requires_mutation, false);
  assert.equal(result.needs_current_evidence, true);
});

test("technical inspection report remains a dedicated inspection deliverable", () => {
  const result = semantic("inspection_report", "conversation");
  assert.equal(result.route, "governed");
  assert.equal(result.engineering_deliverable, "inspection_report");
});

test("operator only diverts to audit report for inspection-report deliverable", () => {
  assert.match(turn, /engineering_deliverable[\s\S]*inspection_report/);
  assert.match(turn, /runOperatorReadOnlyCodeInspectionTurn/);
});

test("conversational product analysis uses inspection as supporting evidence", () => {
  assert.match(fast, /semanticProductInspectionEvidence/);
  assert.match(fast, /code_ai_readonly_inspection/);
  assert.match(fast, /supporting evidence, not the requested response format/);
  assert.match(fast, /answer as a normal discussion rather than an audit report/);
});

test("conversational product analysis does not leak inspection as execution UI", () => {
  assert.match(fast, /execution:\s*null/);
  assert.match(home, /OperatorConversationText content=\{message\.content\}/);
  assert.match(panel, /OperatorConversationText content=\{message\.content\} compact/);
  assert.match(conversationText, /data-avantiqo-conversation-text/);
  assert.doesNotMatch(home, /message\.role === "assistant"[\s\S]{0,220}rounded-bl-md/);
  assert.doesNotMatch(panel, /message\.role === "assistant"[\s\S]{0,220}rounded-bl-md/);
});


test("inspection-report candidates are semantically arbitrated before audit routing", () => {
  const understanding = fs.readFileSync("lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", "utf8");
  assert.match(understanding, /HUMAN_BUSINESS_PARTNER_DELIVERABLE_ARBITER/);
  assert.match(understanding, /what the human primarily wants returned/);
  assert.match(understanding, /inspection is merely supporting work for advice, comparison, recommendations, prioritization, strategy, judgment, or discussion/);
  assert.match(understanding, /engineering_deliverable: "conversation"/);
  assert.match(understanding, /route: normalized\.needs_current_evidence \? "evidence" : "conversation"/);
});
