import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");
const approvalRoute = fs.readFileSync("app/api/platform/admin/intelligence-modal-overflow/route.js", "utf8");
const executionLedger = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowExecutionRuntime.js", "utf8");
const proposalRuntime = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowProposalRuntime.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919193000_intelligence_modal_overflow_execution_claim.sql", "utf8");
const modal = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");
const reasoning = fs.readFileSync("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", "utf8");

test("controlled cognition uses owned local Intelligence only", () => {
  const hierarchy = provider.indexOf("executeHierarchicalLocalIntelligence(input)");
  const queue = provider.indexOf("executeIntelligenceLocalQueue(input)");
  const direct = provider.indexOf("executeIntelligenceLocal(input)");
  assert.ok(hierarchy >= 0 && queue > hierarchy && direct > queue);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /executeIntelligenceModalDirect|RunPod|runpod/);
});

test("paid overflow requires immutable proposal owner approval and bounded spend", () => {
  assert.match(approvalRoute, /requirePlatformAdminAccess/);
  assert.match(approvalRoute, /proposal_id/);
  assert.match(approvalRoute, /approveIntelligenceModalOverflowProposal/);
  assert.doesNotMatch(approvalRoute, /body\?\.lane/);
  assert.doesNotMatch(approvalRoute, /body\?\.maximum_supplier_cost_thb/);
  assert.match(migration, /maximum_calls,[\s\S]*1,/);
  assert.match(migration, /v_proposal\.proposed_supplier_cost_thb/);
  assert.match(migration, /one_paid_job_only/);
  assert.match(approvalRoute, /automatic_modal_fallback_allowed: false/);
});

test("overflow is organization capability infrastructure and metadata bound", () => {
  assert.match(executionLedger, /claim_intelligence_modal_overflow_execution/);
  assert.match(executionLedger, /p_organization_id/);
  assert.match(executionLedger, /p_infrastructure_provider/);
  assert.match(executionLedger, /p_reason_code/);
});

test("overflow requires proven local insufficiency", () => {
  assert.match(overflow, /local_first_required: true/);
  assert.match(overflow, /local_insufficient: true/);
  assert.match(overflow, /local_capacity_checked/);
  assert.match(overflow, /local_attempted/);
  assert.match(overflow, /LOCAL_CONTEXT_CAPACITY_EXCEEDED/);
  assert.match(overflow, /LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED/);
});

test("Fast and Deep are the only Modal Intelligence lanes", () => {
  assert.match(modal, /const LANES = new Set\(\["fast", "deep"\]\)/);
  assert.match(modal, /AVANTIQO_INTELLIGENCE_MODAL_FRONT_FORBIDDEN_LOCAL_ONLY/);
  assert.doesNotMatch(provider, /RunPod|runpod/);
});

test("approval execution claim is created immediately before provider job submission", () => {
  const claim = modal.indexOf("claimIntelligenceModalOverflowExecution({");
  const spawn = modal.indexOf("worker.spawn([payload])");
  const bind = modal.indexOf("markIntelligenceModalOverflowSubmitted({");
  assert.ok(claim >= 0 && spawn > claim && bind > spawn);
  assert.match(modal, /markIntelligenceModalOverflowSubmissionUncertain/);
  assert.match(modal, /modal_overflow_execution_claim_id/);
});

test("reasoning remains owned-provider pinned and authority neutral", () => {
  assert.match(reasoning, /provider_id:\s*OWNED_PROVIDER/);
  assert.match(reasoning, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(reasoning, /external_fallback_allowed:\s*false/);
  assert.match(reasoning, /raw_reasoning_persisted/);
});

test("overflow proposal and approval are revocable and expire", () => {
  assert.match(approvalRoute, /proposal_id or approval_id required/);
  assert.match(approvalRoute, /status: "REVOKED"/);
  assert.match(proposalRuntime, /Math\.max\(5, Math\.min\(Number\(expiryMinutes\) \|\| 30, 120\)\)/);
  assert.match(proposalRuntime, /expires_at:/);
  assert.match(migration, /INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_EXPIRED/);
});

test("no legacy Safe Lease or RunPod dependency remains", () => {
  for (const source of [provider, overflow, executionLedger, modal]) {
    assert.doesNotMatch(source, /RUNPOD_SAFE_LEASE|api\.runpod\.ai|RunPodClient/);
  }
});
