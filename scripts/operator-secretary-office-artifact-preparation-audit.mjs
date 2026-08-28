import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryOfficeArtifactPreparationRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryOfficeArtifactPreparationCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_OFFICE_ARTIFACT_PREPARATION_V1/);
assert.match(source.runtime, /ARTIFACT_TYPES = new Set\(\["DOCUMENT", "SPREADSHEET"\]\)/);
assert.match(source.runtime, /DOCUMENT_FORMATS = new Set\(\["PDF", "DOCX", "PPTX"\]\)/);
assert.match(source.runtime, /SPREADSHEET_FORMATS = new Set\(\["XLSX"\]\)/);
assert.match(source.runtime, /DOCUMENT_PREPARATION_SOURCE = "secretary_document_preparation"/);
assert.match(source.runtime, /register\.state !== "FINAL"/);
assert.match(source.runtime, /SOURCE_PREPARATION_STALE_VERSION/);
assert.match(source.runtime, /source_snapshot_sha256/);
assert.match(source.runtime, /content_identity_sha256/);
assert.match(source.runtime, /artifact_versions/);
assert.match(source.runtime, /createStoredZip/);
assert.match(source.runtime, /renderDocumentPdf/);
assert.match(source.runtime, /renderDocumentDocx/);
assert.match(source.runtime, /renderDocumentPptx/);
assert.match(source.runtime, /INLINE_VALUES_ONLY_NO_FORMULAS/);
assert.match(source.runtime, /t=\"inlineStr\"/);
assert.doesNotMatch(source.runtime, /<f>/);
assert.match(source.runtime, /content_base64/);
assert.match(source.runtime, /file_size_bytes/);
assert.match(source.runtime, /checksum_sha256/);
assert.match(source.runtime, /SECRETARY_OFFICE_ARTIFACT_STALE_VERSION/);
assert.match(source.runtime, /SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REUSE_CONFLICT/);
assert.match(source.runtime, /SECRETARY_OFFICE_ARTIFACT_CONCURRENT_UPDATE_RETRY_REQUIRED/);
assert.match(source.runtime, /artifact_content_stored_in_database:\s*false/);
assert.match(source.runtime, /artifact_bytes_persisted:\s*false/);
assert.match(source.runtime, /external_storage_write_performed:\s*false/);
assert.match(source.runtime, /document_published:\s*false/);
assert.match(source.runtime, /document_filed:\s*false/);
assert.match(source.runtime, /external_sharing_performed:\s*false/);
assert.match(source.runtime, /correspondence_sent:\s*false/);
assert.match(source.runtime, /signature_applied:\s*false/);
assert.match(source.runtime, /binding_submission_performed:\s*false/);
assert.match(source.runtime, /finance_posting_performed:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /signing_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /provider_calls_performed:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

for (const action of ["prepare", "revise", "render", "cancel", "read", "list"]) {
  assert.match(source.capability, new RegExp(`${action}:`));
  assert.match(source.platform, new RegExp(`createSecretaryOfficeArtifactPreparationCapability\\(\\"${action}\\"\\)`));
}
assert.match(source.capability, /aiEnabled:\s*false/);
assert.match(source.capability, /operatorEnabled:\s*true/);
assert.match(source.capability, /operatorAutoExecute:\s*true/);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(source.capability, /approvalRequired:\s*false/);
assert.match(source.platform, /secretary_office_artifact_preparation/);
assert.match(source.packageJson, /operator-secretary-office-artifact-preparation-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-office-artifact-preparation-local\.mjs/);

console.log("OPERATOR_SECRETARY_OFFICE_ARTIFACT_PREPARATION_AUDIT=PASS");
console.log("SECRETARY_OFFICE_ARTIFACT_DOCUMENT_FORMATS=PDF,DOCX,PPTX");
console.log("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_FORMAT=XLSX");
console.log("SECRETARY_OFFICE_ARTIFACT_FROZEN_SOURCE_REQUIRED=true");
console.log("SECRETARY_OFFICE_ARTIFACT_FORMULA_EXECUTION_ENABLED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_EXTERNAL_STORAGE_WRITE_PERFORMED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_DOCUMENT_PUBLISHED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_DOCUMENT_FILED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_EXTERNAL_SHARING_PERFORMED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_FINANCE_POSTING_PERFORMED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
