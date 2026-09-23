import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const reasoning = fs.readFileSync("lib/operator/runtime/OperatorReasoningRuntime.js", "utf8");
const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const proposal = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowProposalRuntime.js", "utf8");
const fingerprint = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowFingerprintPolicy.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919193000_intelligence_modal_overflow_execution_claim.sql", "utf8");

test("deep Business Partner reasoning may propose but never self-approve Modal overflow", () => {
  assert.match(reasoning, /modal_overflow_proposal_allowed: true/);
  assert.match(reasoning, /modal_overflow_request_identity: modalOverflowRequestIdentity/);
  assert.match(reasoning, /AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED/);
  assert.match(reasoning, /Approve this one job\?/);
  assert.match(reasoning, /authorization_effect: "NONE"/);
  assert.doesNotMatch(reasoning, /approveIntelligenceModalOverflowProposal/);
});

test("Fast reasoning does not opt into paid overflow proposal creation", () => {
  const fastStart = reasoning.indexOf("let fastExecution = await ServiceExecutionRuntime.execute");
  const fastEnd = reasoning.indexOf("const instructions = `", fastStart);
  assert.ok(fastStart >= 0 && fastEnd > fastStart);
  const fastSection = reasoning.slice(fastStart, fastEnd);
  assert.doesNotMatch(fastSection, /modal_overflow_proposal_allowed: true/);
});

test("owner approval is deterministic server-side and resumes only the stored original request", () => {
  assert.match(turn, /approveIntelligenceModalOverflowProposal/);
  assert.match(turn, /FULL_ACCESS_ROLES\.has\(normalizeRole\(role\)\)/);
  assert.match(turn, /originalMessage = text\(modalOverflowProposal\.original_message\)/);
  assert.match(turn, /message: originalMessage, source: originalSource/);
  assert.match(turn, /modal_overflow_owner_approved_and_resumed: true/);
  assert.match(turn, /ONE_EXACT_MODAL_JOB_ONLY/);
});

test("declining overflow starts no external compute and clears the pending proposal", () => {
  assert.match(turn, /rejectIntelligenceModalOverflowProposal/);
  assert.match(turn, /I will not use Modal for that job, and no external compute has been started/);
  assert.match(turn, /clearIntelligenceModalOverflowProposal/);
});

test("consumed or uncertain approved jobs are never blindly retried", () => {
  assert.match(turn, /currentStatus === "CONSUMED"/);
  assert.match(turn, /EXECUTION_UNCERTAIN/);
  assert.match(turn, /I will not retry it blindly/);
});

test("proposal request fingerprint binds approval to the exact stable Business Partner request identity", () => {
  assert.match(fingerprint, /intelligenceModalOverflowRequestFingerprint/);
  assert.match(fingerprint, /EXPLICIT_SERVER_REQUEST_IDENTITY/);
  assert.match(provider, /APPROVED_REQUEST_FINGERPRINT_MISMATCH/);
  assert.match(provider, /intelligenceModalOverflowRequestFingerprint/);
  assert.match(migration, /request_fingerprint text not null/);
  assert.match(migration, /INTELLIGENCE_MODAL_OVERFLOW_REQUEST_FINGERPRINT_MISMATCH/);
});

test("proposal approval derives lane reason and ceiling from immutable server proposal", () => {
  assert.match(migration, /approve_intelligence_modal_overflow_proposal/);
  assert.match(migration, /v_proposal\.execution_lane/);
  assert.match(migration, /v_proposal\.reason_code/);
  assert.match(migration, /v_proposal\.proposed_supplier_cost_thb/);
  assert.match(migration, /maximum_calls,[\s\S]*1,/);
  assert.match(migration, /proposal_id/);
});
