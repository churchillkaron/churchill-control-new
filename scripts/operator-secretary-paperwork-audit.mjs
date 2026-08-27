import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryPaperworkCapability.js",
  runtime: "lib/operator/secretary/SecretaryPaperworkCoordinationRuntime.js",
  jobIntake: "lib/operator/secretary/SecretaryJobIntakeRuntime.js",
  jobExecution: "lib/operator/secretary/SecretaryJobExecutionRuntime.js",
  jobApproval: "lib/operator/secretary/SecretaryJobApprovalRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.platform, /createSecretaryPaperworkCapability/);
assert.match(source.platform, /secretary_paperwork/);
assert.match(source.platform, /coordinate:\s*async \(\) => createSecretaryPaperworkCapability\(\)/);

assert.match(source.capability, /capability:\s*"secretary_paperwork"/);
assert.match(source.capability, /action:\s*"coordinate"/);
assert.match(source.capability, /handle this paperwork/i);
assert.match(source.capability, /chase these documents/i);
assert.match(source.capability, /operatorRequiresConfirmation:\s*true/);
assert.match(source.capability, /contextScope:\s*"organization"/);
assert.match(source.capability, /conversation_confirmation/);
assert.match(source.capability, /document_references/);
assert.match(source.capability, /document_requirements/);

assert.match(source.runtime, /job_kind:\s*"PAPERWORK_COORDINATION"/);
assert.match(source.runtime, /document_store:\s*"REFERENCES_ONLY"/);
assert.match(source.runtime, /document_receipt_requires_explicit_evidence:\s*true/);
assert.match(source.runtime, /document_review_requires_explicit_evidence:\s*true/);
assert.match(source.runtime, /signature_authority_created:\s*false/);
assert.match(source.runtime, /binding_submission_authority_created:\s*false/);
assert.match(source.runtime, /legal_acceptance_authority_created:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /paperwork_signature_requires_exact_step_approval:\s*true/);
assert.match(source.runtime, /paperwork_binding_submission_requires_exact_step_approval:\s*true/);
assert.match(source.runtime, /paperwork_legal_acceptance_requires_exact_step_approval:\s*true/);
assert.match(source.runtime, /paperwork_fee_or_payment_requires_exact_step_approval:\s*true/);
assert.match(source.runtime, /approval_scope_is_exact_step_only:\s*true/);
assert.match(source.runtime, /Do not invent a Secretary file vault/i);
assert.match(source.runtime, /described as received only when there is explicit receipt evidence/i);
assert.match(source.runtime, /described as reviewed or accepted only when explicit review\/acceptance evidence exists/i);
assert.match(source.runtime, /unverified and continue the appropriate request, chase, review or clarification workflow/i);
assert.match(source.runtime, /keep following through until the paperwork is complete or the job is cancelled/i);
assert.match(source.runtime, /delegateSecretaryJob/);
assert.match(source.runtime, /EXECUTE_WITH_GATES/);
assert.match(source.runtime, /external_authority_used:\s*false/);

assert.match(source.jobIntake, /secretary_owns_follow_through:\s*true/);
assert.match(source.jobIntake, /source_kind:\s*"MANUAL"/);
assert.match(source.jobIntake, /external_authority_used:\s*false/);

assert.match(source.jobExecution, /HIGH_AUTHORITY_PATTERN/);
assert.match(source.jobExecution, /sign\b/);
assert.match(source.jobExecution, /legal\s+commitment/);
assert.match(source.jobExecution, /make\s+\(\?:a\s\+\)\?payment|make\\s\+\(\?:a\\s\+\)\?payment|payment/);
assert.match(source.jobExecution, /hasExactStepApproval/);
assert.match(source.jobExecution, /secretaryJobExactApprovalOwnedByCanonicalOwner/);
assert.match(source.jobExecution, /const highAuthority = requiresHighAuthority\(step\.instruction\)/);
assert.match(source.jobExecution, /if \(highAuthority && !exactApproval\)/);

assert.match(source.jobApproval, /EXPLICIT_STEP_APPROVAL/);
assert.match(source.jobApproval, /scope:\s*"THIS_STEP_ONLY"/);
assert.match(source.jobApproval, /approved_job_id:\s*job\.id/);
assert.match(source.jobApproval, /approved_step_id:\s*step\.id/);
assert.match(source.jobApproval, /approved_instruction:\s*step\.instruction/);
assert.match(source.jobApproval, /future_steps_authorized:\s*false/);
assert.match(source.jobApproval, /authority_not_extended:\s*true/);

console.log("OPERATOR_SECRETARY_PAPERWORK_AUDIT=PASS");
console.log("SECRETARY_PAPERWORK_DURABLE_COORDINATION=true");
console.log("SECRETARY_PAPERWORK_DOCUMENT_STORE=REFERENCES_ONLY");
console.log("SECRETARY_PAPERWORK_RECEIPT_REQUIRES_EXPLICIT_EVIDENCE=true");
console.log("SECRETARY_PAPERWORK_REVIEW_REQUIRES_EXPLICIT_EVIDENCE=true");
console.log("SECRETARY_PAPERWORK_CHASING_AND_FOLLOW_THROUGH=true");
console.log("SECRETARY_PAPERWORK_SIGNATURE_EXACT_STEP_APPROVAL=true");
console.log("SECRETARY_PAPERWORK_BINDING_SUBMISSION_EXACT_STEP_APPROVAL=true");
console.log("SECRETARY_PAPERWORK_LEGAL_ACCEPTANCE_EXACT_STEP_APPROVAL=true");
console.log("SECRETARY_PAPERWORK_FEE_PAYMENT_EXACT_STEP_APPROVAL=true");
console.log("SECRETARY_PAPERWORK_EXTERNAL_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
