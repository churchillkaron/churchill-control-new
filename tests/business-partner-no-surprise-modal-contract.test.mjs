import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js", "utf8");
const overflow = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalOverflowPolicy.js", "utf8");
const approvalRoute = fs.readFileSync("app/api/platform/admin/intelligence-modal-overflow/route.js", "utf8");
const owned = fs.readFileSync("lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js", "utf8");
const operatorFiles = [
  "app/api/operator/turn/route.js",
  "lib/operator/runtime/OperatorReasoningRuntime.js",
  "lib/operator/runtime/OperatorVerificationRuntime.js",
  "lib/operator/runtime/OperatorAnticipatoryRuntime.js",
  "lib/operator/runtime/PreparedAttachmentClarificationIntelligenceRuntime.js",
].map((file) => fs.readFileSync(file, "utf8")).join("\n");

test("owned operator intelligence policy forbids automatic external fallback", () => {
  assert.match(owned, /allowed_providers: \[OWNED_PROVIDER\]/);
  assert.match(owned, /owned_only_required: true/);
  assert.match(owned, /external_fallback_allowed: false/);
});

test("healthy local queue deterministically forces the owned local intelligence model", () => {
  assert.match(service, /if \(health\?\.ready === true\)/);
  assert.match(service, /allowed_models: \[AVANTIQO_INTELLIGENCE_LOCAL_MODEL\]/);
  assert.match(service, /preferred_models: \[AVANTIQO_INTELLIGENCE_LOCAL_MODEL\]/);
  assert.match(service, /local_owned_pricing_required: true/);
});

test("active Intelligence cannot start Modal overflow at all", () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.doesNotMatch(provider, /intelligenceModalOverflowApprovalRequested|executeIntelligenceModalDirect|Modal/);
  assert.match(overflow, /automatic_fallback: false/);
  assert.match(approvalRoute, /requirePlatformAdminAccess/);
  assert.match(approvalRoute, /proposal_id/);
  assert.doesNotMatch(approvalRoute, /body\?\.maximum_supplier_cost_thb/);
});

test("Business Partner reasoning code cannot manufacture Modal overflow authority", () => {
  assert.doesNotMatch(operatorFiles, /modal_compute_approval_id|modalComputeApprovalId/);
  assert.doesNotMatch(operatorFiles, /intelligence_modal_overflow_reason_code|modal_overflow_reason_code/);
  assert.doesNotMatch(operatorFiles, /modal_requested_supplier_cost_thb/);
  assert.doesNotMatch(operatorFiles, /modal_compute_approval_id|modalComputeApprovalId/);
});
