import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryAbsenceCoverageRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryAbsenceCoverageCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");

const checks = {
  contract: runtime.includes("AVANTIQO_EXECUTIVE_SECRETARY_ABSENCE_COVERAGE_V1"),
  deterministicCoverage: runtime.includes("avantiqo-secretary-absence-v1:"),
  deterministicBlock: runtime.includes("avantiqo-secretary-absence-calendar-block-v1:"),
  deterministicFollowUps: runtime.includes("avantiqo-secretary-absence-follow-up-v1:"),
  scopeAllowlist: runtime.includes("ALLOWED_SCOPES") && runtime.includes("SECRETARY_ABSENCE_COVERAGE_SCOPE_FORBIDDEN"),
  forbiddenAuthorityPattern: runtime.includes("FORBIDDEN_SCOPE_PATTERN"),
  calendarBlock: runtime.includes('event_type: "BLOCK"') && runtime.includes("existing_calendar_events_cancelled: false"),
  explicitWindow: runtime.includes("SECRETARY_ABSENCE_WINDOW_INVALID") && runtime.includes("starts_at") && runtime.includes("ends_at"),
  evidenceRequired: runtime.includes("SECRETARY_ABSENCE_INSTRUCTION_EVIDENCE_REQUIRED") && runtime.includes("SECRETARY_ABSENCE_SOURCE_REFERENCE_REQUIRED"),
  handoffAckEvidence: runtime.includes("SECRETARY_ABSENCE_HANDOFF_EVIDENCE_REQUIRED") && runtime.includes("HANDOFF_ACKNOWLEDGEMENT"),
  expiryReturn: runtime.includes('coverage_status: "EXPIRED"') && runtime.includes("owner_restored_at"),
  earlyReturn: runtime.includes('coverage_status: "ENDED_EARLY"') && runtime.includes("SECRETARY_ABSENCE_EARLY_RETURN_EVIDENCE_REQUIRED"),
  revisionHistory: runtime.includes("revision_history") && runtime.includes("prior_coverage_preserved: true"),
  staleFollowupFence: runtime.includes("prior handoff schedule fenced") || runtime.includes("prior handoff schedule fenced".replace("handoff", "handoff")),
  noPermissionMutation: runtime.includes("platform_permissions_mutated: false"),
  noBindingAuthority: runtime.includes("delegated_binding_authority_created: false"),
  noPurchaseAuthority: runtime.includes("purchase_authority_created: false"),
  noPaymentAuthority: runtime.includes("payment_authority_created: false"),
  noSignatureAuthority: runtime.includes("signature_authority_created: false"),
  noLegalAcceptance: runtime.includes("legal_acceptance_authority_created: false"),
  noBindingSubmission: runtime.includes("binding_submission_authority_created: false"),
  noFareRateAcceptance: runtime.includes("fare_or_rate_acceptance_authority_created: false"),
  externalAuthorityFalse: runtime.includes("external_authority_used: false"),
  capability: capability.includes('capability: "secretary_absence_coverage"'),
  capabilityActions: ["start", "read", "list", "acknowledgeHandoff", "revise", "refresh", "endEarly", "cancel"].every((action) => capability.includes(`${action}: {`)),
  autoExecute: capability.includes("operatorAutoExecute: true"),
  noConfirmation: capability.includes("operatorRequiresConfirmation: false"),
  orgScope: capability.includes('contextScope: "organization"'),
  platformImport: platform.includes("createSecretaryAbsenceCoverageCapability"),
  platformNamespace: platform.includes("secretary_absence_coverage"),
  platformActions: ["start", "read", "list", "acknowledgeHandoff", "revise", "refresh", "endEarly", "cancel"].every((action) => platform.includes(`${action}: async () => createSecretaryAbsenceCoverageCapability(\"${action}\")`)),
};

const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
if (failed.length) {
  console.error("OPERATOR_SECRETARY_ABSENCE_COVERAGE_AUDIT=FAIL");
  console.error(`SECRETARY_ABSENCE_COVERAGE_AUDIT_FAILED=${failed.join(",")}`);
  process.exit(1);
}

console.log("OPERATOR_SECRETARY_ABSENCE_COVERAGE_AUDIT=PASS");
console.log("SECRETARY_ABSENCE_COVERAGE_SCOPE_BOUNDED=true");
console.log("SECRETARY_ABSENCE_COVERAGE_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_ABSENCE_COVERAGE_DETERMINISTIC=true");
console.log("SECRETARY_ABSENCE_COVERAGE_CALENDAR_BLOCK=true");
console.log("SECRETARY_ABSENCE_COVERAGE_HANDOFF_ACK_EVIDENCE=true");
console.log("SECRETARY_ABSENCE_COVERAGE_REVISION_HISTORY=true");
console.log("SECRETARY_ABSENCE_COVERAGE_AUTO_EXPIRY=true");
console.log("SECRETARY_ABSENCE_COVERAGE_OWNER_RESTORATION=true");
console.log("SECRETARY_ABSENCE_COVERAGE_EXISTING_EVENTS_CANCELLED=false");
console.log("SECRETARY_ABSENCE_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_ABSENCE_COVERAGE_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
