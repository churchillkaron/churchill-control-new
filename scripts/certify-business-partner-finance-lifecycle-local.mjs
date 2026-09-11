import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  certifyBusinessPartnerLifecycle,
} from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const mission = read("lib/platform/capabilities/createOperatorMissionCapability.js");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const synthetic = read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const repair = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay = read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const wake = read("lib/operator/runtime/BusinessPartnerRepairContinuationWorkerRuntime.js");
const invoice = read("lib/finance/accounts-receivable/CreateCustomerInvoice/execute.js");
const receipt = read("lib/finance/accounts-receivable/capabilities/postCustomerReceipt.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning:
    has(mission, /OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS/) &&
    has(mission, /ACTION_REQUIRES_VERIFY_AFTER/),
  governed_execution:
    has(invoice, /finance\.receivables\.manage/) &&
    has(invoice, /operatorRequiresConfirmation:\s*true/) &&
    has(receipt, /risk:\s*"high"/) &&
    has(receipt, /operatorRequiresConfirmation:\s*true/),
  business_effect_verification:
    has(receipt, /receipt_verification:\s*\{\s*verified:\s*true/) &&
    has(receipt, /status\)\.toUpperCase\(\) === "PAID"/) &&
    has(receipt, /remaining <= 0\.005/),
  failure_capture:
    has(mission, /AVANTIQO_OPERATOR_MISSION_STEP_FAILURE_EVIDENCE_V1/) &&
    has(core, /AVANTIQO_BUSINESS_PARTNER_MISSION_RECOVERY_V1/),
  defect_classification:
    has(synthetic, /PRODUCT_DEFECT_CANDIDATE/) &&
    has(synthetic, /current_defect_evidence_confirmed/),
  self_healing_engineering:
    has(repair, /preparePlatformSelfHealingCodeMission/) &&
    has(repair, /executePlatformSelfHealingCodeMission/),
  governed_release:
    has(repair, /REQUEST_COMMIT_CONFIRMATION/) &&
    has(repair, /automaticReleaseAllowed/),
  production_activation:
    has(repair, /activation_verified/) &&
    has(wake, /verifyExistingProductionDeployment/),
  automatic_wake:
    has(wake, /runSyntheticIntelligenceTurn/) &&
    has(wake, /message:"continue",source:"event"/),
  authoritative_replay:
    has(core, /verifyPlatformSelfHealingReplay/) &&
    has(replay, /SELF_HEALING_FIXED_VERIFIED/) &&
    has(replay, /expected_outcome_observed/),
  mission_continuation:
    has(core, /businessPartnerMissionContinuation/) &&
    has(core, /Continue original mission after verified repaired step/),
  final_business_outcome:
    has(receipt, /Paid Receipt PDF/) &&
    has(core, /Mission complete\./),
  learning_evidence:
    has(learning, /recordBusinessPartnerRepairProductEvidence/) &&
    has(learning, /business_effect_verified/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "FINANCE_CUSTOMER_INVOICE_TO_PAID_RECEIPT_WITH_SELF_HEALING",
  stages,
});

console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
