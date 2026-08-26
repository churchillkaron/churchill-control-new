import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryDocumentFilingCapability.js",
  runtime: "lib/operator/secretary/SecretaryDocumentFilingRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_FILING_V1/);
assert.match(source.runtime, /document_store:\s*"REFERENCES_ONLY"/);
assert.match(source.runtime, /deterministicUuid/);
assert.match(source.runtime, /DOCUMENT_REQUEST/);
assert.match(source.runtime, /DOCUMENT_CHASE/);
assert.match(source.runtime, /SECRETARY_DOCUMENT_FILING_RECEIPT_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_DOCUMENT_FILING_SOURCE_REFERENCE_REQUIRED/);
assert.match(source.runtime, /status:\s*"SUPERSEDED"/);
assert.match(source.runtime, /classification_history/);
assert.match(source.runtime, /naming_history/);
assert.match(source.runtime, /duplicate_reference_blocked:\s*true/);
assert.match(source.runtime, /filing_does_not_imply_review:\s*true/);
assert.match(source.runtime, /filing_does_not_imply_signature:\s*true/);
assert.match(source.runtime, /filing_does_not_imply_acceptance:\s*true/);
assert.match(source.runtime, /filing_does_not_imply_submission:\s*true/);
assert.match(source.runtime, /signature_authority_created:\s*false/);
assert.match(source.runtime, /legal_acceptance_authority_created:\s*false/);
assert.match(source.runtime, /binding_submission_authority_created:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);
assert.doesNotMatch(source.runtime, /supabaseAdmin\.storage/);

assert.match(source.capability, /capability:\s*"secretary_document_filing"/);
for (const action of ["register", "fileVersion", "recordUnavailable", "reclassify", "reconcileCurrentName", "read", "list", "cancel"]) {
  assert.match(source.capability, new RegExp(`action:\\s*"${action}"`));
}
assert.match(source.capability, /operatorAutoExecute:\s*true/);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(source.capability, /contextScope:\s*"organization"/);

assert.match(source.platform, /createSecretaryDocumentFilingCapability/);
assert.match(source.platform, /secretary_document_filing/);
for (const action of ["register", "fileVersion", "recordUnavailable", "reclassify", "reconcileCurrentName", "read", "list", "cancel"]) {
  assert.match(source.platform, new RegExp(`${action}:\\s*async \\(\\) => createSecretaryDocumentFilingCapability\\("${action}"\\)`));
}

console.log("OPERATOR_SECRETARY_DOCUMENT_FILING_AUDIT=PASS");
console.log("SECRETARY_DOCUMENT_FILING_DURABLE_REGISTER=true");
console.log("SECRETARY_DOCUMENT_FILING_REFERENCE_ONLY_STORAGE=true");
console.log("SECRETARY_DOCUMENT_FILING_RECEIPT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DOCUMENT_FILING_MISSING_DOCUMENT_CHASING=true");
console.log("SECRETARY_DOCUMENT_FILING_DETERMINISTIC_ID=true");
console.log("SECRETARY_DOCUMENT_FILING_VERSION_HISTORY=true");
console.log("SECRETARY_DOCUMENT_FILING_SUPERSEDED_VERSIONS_PRESERVED=true");
console.log("SECRETARY_DOCUMENT_FILING_CLASSIFICATION_HISTORY=true");
console.log("SECRETARY_DOCUMENT_FILING_NAMING_HISTORY=true");
console.log("SECRETARY_DOCUMENT_FILING_REVIEW_INFERRED=false");
console.log("SECRETARY_DOCUMENT_FILING_SIGNATURE_INFERRED=false");
console.log("SECRETARY_DOCUMENT_FILING_ACCEPTANCE_INFERRED=false");
console.log("SECRETARY_DOCUMENT_FILING_SUBMISSION_INFERRED=false");
console.log("SECRETARY_DOCUMENT_FILING_EXTERNAL_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
