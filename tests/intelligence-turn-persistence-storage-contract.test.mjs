import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/operator/turn/route.js", import.meta.url),
  "utf8",
);

test("assistant turn storage avoids duplicating visible response and conversation state", () => {
  assert.match(route, /const persistedDecision = \{[\s\S]*\.\.\.normalizedDecision,[\s\S]*paired_user_turn_id:/);
  assert.match(route, /delete persistedDecision\.response_text/);
  assert.match(route, /delete persistedDecision\.agreement_state/);
  assert.match(route, /delete persistedDecision\.project_state/);
  assert.match(route, /decision: persistedDecision/);
});

test("authoritative agreement and project state still persist separately", () => {
  assert.match(route, /agreementState: nextAgreementState/);
  assert.match(route, /projectState: nextProjectState/);
  assert.match(route, /turn_duplicate_payload_bytes_avoided: turnDuplicatePayloadBytesAvoided/);
});

const conversationRuntime = fs.readFileSync(
  new URL("../lib/operator/runtime/IntelligenceConversationRuntime.js", import.meta.url),
  "utf8",
);

test("turn history keeps visible content and governed execution proof", () => {
  assert.match(conversationRuntime, /p_content: normalizedContent/);
  assert.match(conversationRuntime, /p_evidence: object\(evidence\)/);
  assert.match(conversationRuntime, /p_execution: object\(execution\)/);
  assert.match(conversationRuntime, /p_navigation: object\(navigation\)/);
  assert.match(conversationRuntime, /p_agreement_state: persistedAgreementState/);
  assert.match(conversationRuntime, /p_project_state: object\(projectState\)/);
  assert.match(conversationRuntime, /select\("id, role, source, content, decision, evidence, execution, navigation, created_at"\)/);
});
