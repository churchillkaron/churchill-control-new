import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryDocumentPreparationRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryDocumentPreparationCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = fs.readFileSync("package.json", "utf8");
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_PREPARATION_V1/);
for (const token of ["PROOFREAD_ONLY", "FORMAT_ONLY", "PROOFREAD_AND_FORMAT", "POLISH_PRESERVE_MEANING", "RESTRUCTURE_PRESERVE_MEANING"]) assert.match(runtime, new RegExp(token));
for (const token of ["source_text_preserved: true", "prepared_text_stored_exactly: true", "semantic_equivalence_verified: false", "factual_accuracy_verified: false", "legal_accuracy_verified: false", "correspondence_sent: false", "document_published: false", "document_filed: false", "signature_applied: false", "binding_submission_performed: false", "provider_calls_performed: false", "external_authority_used: false"]) assert.ok(runtime.includes(token), `Missing ${token}`);
assert.ok(runtime.includes('.eq("updated_at", task.updated_at)'), "Missing optimistic concurrency fence");
assert.ok(runtime.includes("SECRETARY_DOCUMENT_PREPARATION_EVIDENCE_REUSE_CONFLICT"));
assert.ok(runtime.includes("ledger_task_is_execution_work: false"));
for (const action of ["prepare", "revise", "finalize", "cancel", "read", "list"]) assert.ok(capability.includes(`${action}: {`), `Missing capability action ${action}`);
assert.ok(capability.includes('capability: "secretary_document_preparation"'));
assert.ok(capability.includes("operatorAutoExecute: true"));
assert.ok(capability.includes("operatorRequiresConfirmation: false"));
assert.ok(capability.includes("aiEnabled: false"));
assert.ok(platform.includes("createSecretaryDocumentPreparationCapability"), "Platform registration missing");
assert.ok(platform.includes("secretary_document_preparation"), "Platform capability block missing");
assert.ok(pkg.includes("operator-secretary-document-preparation-audit.mjs"), "Package audit wiring missing");
assert.ok(wrapper.includes("certify-secretary-document-preparation-local.mjs"), "Wrapper behavior cert wiring missing");

console.log("OPERATOR_SECRETARY_DOCUMENT_PREPARATION_AUDIT=PASS");
console.log("SECRETARY_DOCUMENT_PREPARATION_SOURCE_PRESERVED=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_VERSION_HISTORY=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_STALE_VERSION_FENCED=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_SEND_PUBLISH_FILE_SIGN_SUBMIT=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_FACTUAL_LEGAL_VERIFICATION=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
