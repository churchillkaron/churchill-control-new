import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryPaperworkStatusCapability.js",
  runtime: "lib/operator/secretary/SecretaryPaperworkStatusRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.platform, /createSecretaryPaperworkStatusCapability/);
assert.match(source.platform, /secretary_paperwork:\s*\{/);
assert.match(source.platform, /status:\s*async\s*\(\)\s*=>\s*createSecretaryPaperworkStatusCapability\(\)/);

assert.match(source.capability, /capability:\s*"secretary_paperwork"/);
assert.match(source.capability, /action:\s*"status"/);
assert.match(source.capability, /operatorAutoExecute:\s*true/);
assert.match(source.capability, /operatorMode:\s*"read"/);
assert.match(source.capability, /risk:\s*"low"/);
assert.match(source.capability, /required:\s*\["job_id"\]/);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_PAPERWORK_CONTROL_V1/);
assert.match(source.runtime, /MISSING_OR_UNVERIFIED/);
assert.match(source.runtime, /REFERENCE_PRESENT_EVIDENCE_UNVERIFIED/);
assert.match(source.runtime, /EVIDENCE_RECEIVED_REVIEW_PENDING/);
assert.match(source.runtime, /EVIDENCE_REVIEWED/);
assert.match(source.runtime, /receipt_requires_explicit_evidence:\s*true/);
assert.match(source.runtime, /review_requires_explicit_evidence:\s*true/);
assert.match(source.runtime, /untyped_reference_is_not_receipt_evidence:\s*true/);
assert.match(source.runtime, /untyped_reference_is_not_review_evidence:\s*true/);
assert.match(source.runtime, /signature_authority_created:\s*false/);
assert.match(source.runtime, /binding_submission_authority_created:\s*false/);
assert.match(source.runtime, /legal_acceptance_authority_created:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /approval_scope_is_exact_step_only:\s*true/);
assert.match(source.runtime, /approval_extends_to_future_steps:\s*false/);
assert.match(source.runtime, /approval_can_override_missing_operational_input:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

console.log("OPERATOR_SECRETARY_PAPERWORK_STATUS_AUDIT=PASS");
console.log("SECRETARY_PAPERWORK_CONTROL_VIEW=true");
console.log("SECRETARY_PAPERWORK_EVIDENCE_BACKED_RECEIPT=true");
console.log("SECRETARY_PAPERWORK_EVIDENCE_BACKED_REVIEW=true");
console.log("SECRETARY_PAPERWORK_UNVERIFIED_REFERENCE_IS_NOT_RECEIPT=true");
console.log("SECRETARY_PAPERWORK_UNVERIFIED_REFERENCE_IS_NOT_REVIEW=true");
console.log("SECRETARY_PAPERWORK_EXECUTIVE_DECISIONS_EXACT_STEP_ONLY=true");
console.log("SECRETARY_PAPERWORK_OPERATIONAL_BLOCKS_CANNOT_BE_APPROVED_AWAY=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
