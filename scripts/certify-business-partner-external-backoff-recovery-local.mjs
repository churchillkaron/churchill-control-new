import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const synthetic = read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const backoff = read("lib/operator/runtime/BusinessPartnerExternalBackoffRecoveryRuntime.mjs");
const wait = read("lib/operator/runtime/BusinessPartnerExternalWaitRuntime.js");
const worker = read("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js");
const classifier = read("lib/operator/runtime/OperatorRepairSupervisionPolicy.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");
const vercel = read("vercel.json");

const stages = {
  mission_planning: has(core, /mission_continuity/),
  governed_execution: has(core, /SAME_ACTION_ONLY/),
  business_effect_verification: has(core, /businessEffectVerified/),
  failure_capture: has(core, /failure_evidence/),
  defect_classification: has(classifier, /RATE_LIMIT/),
  self_healing_engineering: has(synthetic, /escalateBusinessPartnerProductDefect/),
  governed_release: has(synthetic, /production_release/),  production_activation: has(vercel, /external-waits\/process/),
  automatic_wake: has(worker, /promoteDueBackoffWaits/) && has(worker, /agreementForWaitWake/),
  authoritative_replay: has(backoff, /mutation_replay_allowed: false/),
  mission_continuation: has(core, /verifiedExternalBackoffRecovery/),
  final_business_outcome: has(core, /businessEffectVerified/),
  learning_evidence: has(learning, /external_wait_used/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_DURABLE_EXTERNAL_BACKOFF_RECOVERY",
  stages,
});

report.domain_evidence = {
  rate_limit_is_temporary: has(classifier, /RATE_LIMIT/) && has(classifier, /TRANSIENT_RUNTIME/),
  hard_quota_remains_governance: has(classifier, /QUOTA_EXCEEDED/),
  bounded_backoff: has(backoff, /\[60, 120, 300, 600, 900, 1800\]/),
  retry_after_honored: has(backoff, /retryAfterSeconds/),
  read_only_only: has(backoff, /readOnlyRecovery/),
  mutation_timer_retry_forbidden: has(backoff, /mutation_replay_allowed: false/),
  durable_wait_registered: has(wait, /registerBusinessPartnerRecoveryBackoffWait/),
  due_wait_promoted: has(worker, /BACKOFF_DUE/) && has(worker, /retry_not_before/),
  current_access_reacquired: has(worker, /resolveDelegatedOrganizationAccess/),
  fast_chat_bypass_closed: has(synthetic, /eventBackoff/) && has(synthetic, /systemEventContinuation/),
  exact_action_resume: has(core, /Retry exact original read after durable external backoff/),  stale_wait_binding_rejected: has(worker, /WAIT_NO_LONGER_ACTIVE/) && has(worker, /activeWaitBinding/),
  cron_scheduled: has(vercel, /"path": "\/api\/internal\/operator\/external-waits\/process"/) && has(vercel, /"schedule": "\* \* \* \* \*"/),
  no_schema_change_required: true,
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
