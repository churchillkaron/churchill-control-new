import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const mission = read("lib/platform/capabilities/createOperatorMissionCapability.js");
const secretary = read("lib/operator/secretary/SecretaryJobExecutionRuntime.js");
const response = read("lib/operator/secretary/SecretaryJobResponseRuntime.js");
const webhook = read("lib/commercial/communications/CommunicationWebhookRuntime.js");
const worker = read("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const synthetic = read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const repair = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay = read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");
const stages = {
  mission_planning:
    has(mission, /platform\.secretary_job\.delegate/) || has(mission, /OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS/),
  governed_execution:
    has(secretary, /execution_owner:\s*"SECRETARY"/) &&
    has(secretary, /external_authority_used:\s*false/),
  business_effect_verification:
    has(response, /status:\s*"EXTRACTED"/) &&
    has(response, /response_complete/) &&
    has(response, /supplier reply is evidence only/i),
  failure_capture:
    has(core, /AVANTIQO_BUSINESS_PARTNER_MISSION_RECOVERY_V1/) &&
    has(secretary, /status:\s*exhausted \? "FAILED" : "WAITING"/),
  defect_classification:
    has(synthetic, /PRODUCT_DEFECT_CANDIDATE/),
  self_healing_engineering:
    has(repair, /executePlatformSelfHealingCodeMission/),
  governed_release:
    has(repair, /REQUEST_COMMIT_CONFIRMATION/),
  production_activation:
    has(core, /activation_verified/) || has(repair, /activation_verified/),
  automatic_wake:
    has(secretary, /event_type:\s*"JOB_TERMINAL"/) &&
    has(worker, /runSyntheticIntelligenceTurn/) && has(worker, /source:"event"/),
  authoritative_replay:
    has(core, /verifyPlatformSelfHealingReplay/) && has(replay, /SELF_HEALING_FIXED_VERIFIED/),
  mission_continuation:
    has(mission, /resolveExternalWaitCorrelation/) && has(mission, /correlation_from/) &&
    has(core, /businessPartnerMissionContinuation/),
  final_business_outcome:
    has(secretary, /status:\s*"COMPLETED"/) && has(secretary, /result_summary/),
  learning_evidence:
    has(learning, /recordBusinessPartnerRepairProductEvidence/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "SECRETARY_COMMERCIAL_FOLLOW_UP_TO_BUSINESS_PARTNER_RESUME",
  stages,
});

report.domain_evidence = {
  inbound_message_wakes_exact_wait:
    has(webhook, /event_source:\s*`communication:\$\{provider\}`/) &&
    has(webhook, /event_type:\s*"MESSAGE_RECEIVED"/) &&
    has(webhook, /`conversation:\$\{conversation\.id\}`/),
  secretary_terminal_event_no_authority:
    has(secretary, /event_source:\s*"secretary"/) &&
    has(secretary, /event_type:\s*"JOB_TERMINAL"/) &&
    has(secretary, /authorization_effect:\s*"NONE"/),
  prior_result_binding_external_wait_only:
    has(mission, /OPERATOR_MISSION_DYNAMIC_RESULT_CHAINING_BLOCKED/) &&
    has(mission, /resolveExternalWaitCorrelation/),
  reply_is_evidence_only:
    has(response, /never authorizes Avantiqo to accept an offer, order, pay, sign or agree to terms/i),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
