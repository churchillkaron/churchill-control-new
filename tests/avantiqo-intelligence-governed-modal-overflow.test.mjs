import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");
const modal = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");
const executionLedger = fs.readFileSync("lib/platform/service-runtime/governance/IntelligenceModalOverflowExecutionRuntime.js", "utf8");
const executionMigration = fs.readFileSync("supabase/migrations/20260919193000_intelligence_modal_overflow_execution_claim.sql", "utf8");
const route = fs.readFileSync("app/api/platform/admin/intelligence-modal-overflow/route.js", "utf8");
const worker = fs.readFileSync("services/avantiqo-intelligence-modal/modal_app.py", "utf8");
const deployWorkflow = fs.readFileSync(".github/workflows/avantiqo-intelligence-modal-deploy.yml", "utf8");

test("Intelligence always attempts owned local compute before governed Modal overflow", () => {
  const queue = provider.indexOf("executeIntelligenceLocalQueue(effectiveInput)");
  const direct = provider.indexOf("executeIntelligenceLocal(effectiveInput)");
  const overflowCall = provider.indexOf("executeIntelligenceModalDirect({");
  assert.ok(queue >= 0);
  assert.ok(direct >= 0);
  assert.ok(overflowCall > queue);
  assert.ok(overflowCall > direct);
  assert.match(provider, /intelligenceModalOverflowApprovalRequested\(effectiveInput\)/);
  assert.match(provider, /executionLane === "front"/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED/);
});

test("Modal overflow requires explicit approval, positive cost reservation and local insufficiency proof", () => {
  assert.match(overflow, /AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED/);
  assert.match(overflow, /AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_COST_ESTIMATE_REQUIRED/);
  assert.match(overflow, /local_first_required: true/);
  assert.match(overflow, /local_insufficient: true/);
  assert.match(overflow, /automatic_fallback: false/);
  assert.match(overflow, /explicit_approval_required: true/);
  assert.match(overflow, /LOCAL_CONTEXT_CAPACITY_EXCEEDED/);
  assert.match(overflow, /LOCAL_OUTPUT_CAPACITY_EXCEEDED/);
  assert.match(overflow, /LOCAL_GPU_MEMORY_INSUFFICIENT/);
  assert.match(overflow, /LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED/);
});

test("Modal transport atomically claims exact approval before spawning Fast or Deep", () => {
  const claim = modal.indexOf("claimIntelligenceModalOverflowExecution({");
  const spawn = modal.indexOf("worker.spawn([payload])");
  const bind = modal.indexOf("markIntelligenceModalOverflowSubmitted({");
  assert.ok(claim >= 0);
  assert.ok(spawn > claim);
  assert.ok(bind > spawn);
  assert.match(modal, /modal_overflow_execution_claim_id: executionClaim\.execution_claim_id/);
  assert.match(modal, /markIntelligenceModalOverflowSubmissionUncertain/);
  assert.match(modal, /AVANTIQO_INTELLIGENCE_MODAL_JOB_BINDING_FAILED/);
  assert.match(modal, /const LANES = new Set\(\["fast", "deep"\]\)/);
  assert.match(modal, /AVANTIQO_INTELLIGENCE_MODAL_FRONT_FORBIDDEN_LOCAL_ONLY/);
});

test("overflow migration is self-contained against the live generic approval contract", () => {
  assert.match(executionMigration, /create table if not exists public\.modal_compute_approvals/);
  assert.match(executionMigration, /alter table public\.modal_compute_approvals enable row level security/);
  assert.match(executionMigration, /revoke all on public\.modal_compute_approvals from anon, authenticated/);
  assert.match(executionMigration, /create or replace function public\.consume_modal_compute_approval/);
  assert.match(executionMigration, /create table if not exists public\.intelligence_modal_overflow_executions/);
  assert.match(executionMigration, /create or replace function public\.claim_intelligence_modal_overflow_execution/);
});

test("overflow execution claim is transactional one-approval one-usage one-provider-job authority", () => {
  assert.match(executionLedger, /claim_intelligence_modal_overflow_execution/);
  assert.match(executionLedger, /INTELLIGENCE_MODAL_OVERFLOW_EXACT_APPROVAL_ID_REQUIRED/);
  assert.match(executionLedger, /markIntelligenceModalOverflowSubmitted/);
  assert.match(executionLedger, /markIntelligenceModalOverflowTerminal/);
  assert.match(executionLedger, /markIntelligenceModalOverflowSettlementUncertain/);
  assert.match(executionMigration, /unique \(approval_id\)/);
  assert.match(executionMigration, /unique \(provider_job_id\)/);
  assert.match(executionMigration, /organization_id, usage_id/);
  assert.match(executionMigration, /maximum_calls <> 1 or v_approval\.used_calls <> 0/);
  assert.match(executionMigration, /status = 'EXHAUSTED'/);
  assert.match(executionMigration, /automatic_fallback_allowed/);
});

test("application runtime has no generic approval auto-selection path", () => {
  assert.match(executionLedger, /INTELLIGENCE_MODAL_OVERFLOW_EXACT_APPROVAL_ID_REQUIRED/);
  assert.doesNotMatch(executionLedger, /order\("approved_at"/);
  assert.doesNotMatch(executionLedger, /activeApproval/);
});

test("owner approval endpoint accepts only immutable proposal authority", () => {
  assert.match(route, /requirePlatformAdminAccess/);
  assert.match(route, /proposal_id/);
  assert.match(route, /approveIntelligenceModalOverflowProposal/);
  assert.doesNotMatch(route, /body\?\.lane/);
  assert.doesNotMatch(route, /body\?\.reason_code/);
  assert.doesNotMatch(route, /body\?\.maximum_supplier_cost_thb/);
  assert.match(route, /automatic_modal_fallback_allowed: false/);
  assert.match(route, /modal_compute_approval_id: approval\.approval_id/);
  assert.match(executionMigration, /maximum_calls,[\s\S]*1,/);
  assert.match(executionMigration, /one_paid_job_only/);
});

test("Modal Fast and Deep workers remain scale-to-zero single-H100 functions", () => {
  assert.match(worker, /GPU = "H100"/);
  assert.equal((worker.match(/cpu=4/g) || []).length >= 2, true);
  assert.equal((worker.match(/memory=65536/g) || []).length >= 2, true);
  assert.match(worker, /def fast\(data: dict\[str, Any\]\)/);
  assert.match(worker, /def deep\(data: dict\[str, Any\]\)/);
  assert.equal((worker.match(/min_containers=0/g) || []).length >= 2, true);
  assert.equal((worker.match(/max_containers=1/g) || []).length >= 2, true);
  assert.equal((worker.match(/@modal\.concurrent\(max_inputs=1\)/g) || []).length >= 2, true);
  assert.match(worker, /FAST_STARTUP_TIMEOUT_SECONDS = 60/);
  assert.match(worker, /DEEP_STARTUP_TIMEOUT_SECONDS = 120/);
  assert.match(worker, /FAST_HARD_TIMEOUT_SECONDS = 60/);
  assert.match(worker, /DEEP_HARD_TIMEOUT_SECONDS = 10 \* 60/);
  assert.match(worker, /startup_timeout=FAST_STARTUP_TIMEOUT_SECONDS/);
  assert.match(worker, /startup_timeout=DEEP_STARTUP_TIMEOUT_SECONDS/);
});

test("Fast/Deep Modal deployment is manual-only and cannot deploy Front cognition", () => {
  assert.match(deployWorkflow, /workflow_dispatch:/);
  assert.match(deployWorkflow, /approve_deploy:/);
  assert.match(deployWorkflow, /if: \$\{\{ inputs\.approve_deploy == true \}\}/);
  assert.match(deployWorkflow, /modal deploy --strategy recreate modal_app\.py/);
  assert.match(deployWorkflow, /INFERENCE_JOB_SUBMITTED=false/);
  assert.match(deployWorkflow, /AUTOMATIC_FALLBACK_ENABLED=false/);
  assert.match(deployWorkflow, /AVANTIQO_INTELLIGENCE_MODAL_FRONT_DEPLOYED=false/);
  assert.doesNotMatch(deployWorkflow, /^  push:/m);
  assert.doesNotMatch(deployWorkflow, /^  schedule:/m);
});


test("development runtime hard-disables paid Intelligence Modal", () => {
  assert.match(overflow, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(overflow, /AVANTIQO_INTELLIGENCE_MODAL_PAID_EXECUTION_DISABLED_OUTSIDE_PRODUCTION/);
  assert.match(overflow, /intelligenceModalPaidExecutionAllowed\(\) && Boolean\(approvalId\(input\)\)/);
  assert.match(provider, /proposalId && !intelligenceModalOverflowProposalWorkflowEnabled\(\)/);
  assert.match(provider, /modal_overflow_available_with_approval =[\s\S]*intelligenceModalOverflowProposalWorkflowEnabled\(\)/);
});
