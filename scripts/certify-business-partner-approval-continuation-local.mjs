import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const mission = read("lib/platform/capabilities/createOperatorMissionCapability.js");
const worker = read("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js");
const approval = read("lib/shared/approvals/executeApproval.js");
const rejection = read("lib/shared/approvals/rejectApprovalRequest.js");
const governance = read("lib/operator/governance/operatorExecutionGovernance.js");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const synthetic = read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const approvalWaits =
  has(mission, /registerApprovalDecisionWaits/) &&
  has(mission, /APPROVAL_GRANTED/) &&
  has(mission, /APPROVAL_REJECTED/) &&
  has(mission, /approval_request:\$\{approvalRequestId\}/);
const approvalWake =
  has(worker, /awaiting_approval/) &&
  has(worker, /approval_request:\$\{approvalRequestId\}/) &&
  has(worker, /cancelApprovalSiblingWaits/) &&
  has(worker, /runSyntheticIntelligenceTurn/);

const decisionEvents =
  has(approval, /event_type:\s*"APPROVAL_GRANTED"/) &&
  has(rejection, /event_type:\s*"APPROVAL_REJECTED"/) &&
  has(approval, /emitBusinessPartnerBusinessEvent/) &&
  has(rejection, /emitBusinessPartnerBusinessEvent/);

const authoritativeDecision =
  has(governance, /resolveExistingApprovalRequest/) &&
  has(governance, /status === "approved"/) &&
  has(governance, /APPROVAL_REJECTED/) &&
  has(mission, /resolveOperatorExecutionApproval/);

const stages = {
  mission_planning: approvalWaits,
  governed_execution: authoritativeDecision,
  business_effect_verification: has(mission, /executeVerification/),
  failure_capture: has(mission, /missionStepFailureEvidence/),
  defect_classification: has(synthetic, /PRODUCT_DEFECT_CANDIDATE/),
  self_healing_engineering: has(core, /business_partner_recovery/),
  governed_release: has(core, /production_release/),
  production_activation: has(worker, /resolveDelegatedOrganizationAccess/),
  automatic_wake: approvalWake && decisionEvents,
  authoritative_replay: has(core, /verifyPlatformSelfHealingReplay/),
  mission_continuation: has(core, /resume_kind:\s*"mission"/),
  final_business_outcome: authoritativeDecision,
  learning_evidence: has(learning, /recordBusinessPartnerRepairProductEvidence/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_EXACT_APPROVAL_AUTO_CONTINUATION",
  stages,
});
report.domain_evidence = {
  exact_grant_wait: approvalWaits,
  exact_rejection_wait: approvalWaits,
  current_approval_state_authoritative: authoritativeDecision,
  sibling_wait_cancelled: has(worker, /CANCELLED_SIBLING_APPROVAL_WAIT/),
  event_authority_none: has(worker, /authorization_effect:\s*"NONE"/),
};
console.log(JSON.stringify(report, null, 2));
if (!report.certified || Object.values(report.domain_evidence).some((value) => value !== true)) {
  process.exitCode = 1;
}
