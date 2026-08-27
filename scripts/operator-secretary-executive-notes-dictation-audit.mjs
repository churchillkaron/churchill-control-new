import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  runtime: "lib/operator/secretary/SecretaryExecutiveNotesDictationRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryExecutiveNotesDictationCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
};
const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])));

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_NOTES_DICTATION_V1/);
assert.match(source.runtime, /secretary_executive_notes_dictation/);
assert.match(source.runtime, /executive_notes_dictation_v1/);
assert.match(source.runtime, /exact_content/);
assert.match(source.runtime, /content_versions/);
assert.match(source.runtime, /content_sha256/);
assert.match(source.runtime, /SECRETARY_NOTES_STALE_VERSION/);
assert.match(source.runtime, /SECRETARY_NOTES_EVIDENCE_REUSE_CONFLICT/);
assert.match(source.runtime, /ledger_task_is_execution_work:\s*false/);
assert.match(source.runtime, /scope:\s*"DOCUMENT_COORDINATION"/);
assert.match(source.runtime, /exact_text_preserved:\s*true/);
assert.match(source.runtime, /content_modified_by_secretary:\s*false/);
assert.match(source.runtime, /transcription_performed:\s*false/);
assert.match(source.runtime, /audio_processed:\s*false/);
assert.match(source.runtime, /speaker_identity_inferred:\s*false/);
assert.match(source.runtime, /meaning_inferred:\s*false/);
assert.match(source.runtime, /instruction_inferred:\s*false/);
assert.match(source.runtime, /directive_created:\s*false/);
assert.match(source.runtime, /decision_created:\s*false/);
assert.match(source.runtime, /commitment_created:\s*false/);
assert.match(source.runtime, /task_execution_created:\s*false/);
assert.match(source.runtime, /correspondence_sent:\s*false/);
assert.match(source.runtime, /document_published:\s*false/);
assert.match(source.runtime, /signature_applied:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /signing_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /provider_calls_performed:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

assert.match(source.capability, /capability:\s*"secretary_executive_notes"/);
for (const action of ["capture","append","revise","finalize","cancel","read","list"]) assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
assert.match(source.capability, /This never sends correspondence, creates directives\/decisions\/commitments, signs documents, or executes work/);
assert.match(source.platform, /createSecretaryExecutiveNotesDictationCapability/);
assert.match(source.platform, /secretary_executive_notes:\s*\{/);
assert.match(source.packageJson, /operator-secretary-executive-notes-dictation-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-executive-notes-dictation-local\.mjs/);

console.log("OPERATOR_SECRETARY_EXECUTIVE_NOTES_DICTATION_AUDIT=PASS");
console.log("SECRETARY_EXECUTIVE_NOTES_EXACT_TEXT=true");
console.log("SECRETARY_EXECUTIVE_NOTES_VERSION_HISTORY=true");
console.log("SECRETARY_EXECUTIVE_NOTES_STALE_VERSION_FENCED=true");
console.log("SECRETARY_EXECUTIVE_NOTES_DIRECTIVE_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_DECISION_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_COMMITMENT_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_TASK_EXECUTION_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_CORRESPONDENCE_SENT=false");
console.log("SECRETARY_EXECUTIVE_NOTES_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
