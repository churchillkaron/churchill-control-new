import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  prepareSecretaryDocument,
  reviseSecretaryDocumentPreparation,
  finalizeSecretaryDocumentPreparation,
} from "../lib/operator/secretary/SecretaryDocumentPreparationRuntime.js";
import {
  prepareSecretaryOfficeArtifact,
  reviseSecretaryOfficeArtifact,
  renderSecretaryOfficeArtifact,
  readSecretaryOfficeArtifact,
} from "../lib/operator/secretary/SecretaryOfficeArtifactPreparationRuntime.js";
import { createSecretaryOfficeArtifactPreparationCapability } from "../lib/platform/capabilities/createSecretaryOfficeArtifactPreparationCapability.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${expected}`);
  assert.equal(caught.message, expected);
}

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Office Artifact Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const sourceText = "Quarterly operating summary source.";
const preparedTextV1 = "Quarterly Operating Summary\nRevenue increased during the quarter.\nActions: review staffing and supplier terms.";
const prep = await prepareSecretaryDocument({
  context,
  payload: {
    kind: "REPORT",
    title: "Quarterly Operating Summary",
    source_text: sourceText,
    prepared_text: preparedTextV1,
    change_scope: "RESTRUCTURE_PRESERVE_MEANING",
    change_summary: "Explicit certification fixture.",
    instruction: "Prepare the supplied report text only.",
    evidence_id: "office-artifact-source-1",
    prepared_at: "2036-01-10T01:00:00Z",
  },
});
const finalV1 = await finalizeSecretaryDocumentPreparation({
  context,
  payload: { preparation_id: prep.preparation.id, evidence_id: "office-artifact-source-final-1", finalized_at: "2036-01-10T01:05:00Z", expected_version: 1 },
});
assert.equal(finalV1.record.state, "FINAL");
assert.equal(finalV1.record.version, 2);

const documentArtifact = await prepareSecretaryOfficeArtifact({
  context,
  payload: {
    artifact_type: "DOCUMENT",
    formats: ["PDF", "DOCX", "PPTX"],
    source_preparation_id: prep.preparation.id,
    source_preparation_version: 2,
    evidence_id: "office-artifact-doc-1",
    prepared_at: "2036-01-10T01:10:00Z",
  },
});
assert.equal(documentArtifact.record.version, 1);
assert.equal(documentArtifact.record.current_source_snapshot.exact_prepared_text, preparedTextV1);
assert.equal(documentArtifact.record.artifact_versions.length, 1);
assert.equal(documentArtifact.record.initial_render_manifest.length, 3);

const documentReplay = await prepareSecretaryOfficeArtifact({
  context,
  payload: {
    artifact_type: "DOCUMENT",
    formats: ["PDF", "DOCX", "PPTX"],
    source_preparation_id: prep.preparation.id,
    source_preparation_version: 2,
    evidence_id: "office-artifact-doc-1",
    prepared_at: "2036-01-10T01:10:00Z",
  },
});
assert.equal(documentReplay.replay_safe, true);
assert.equal(documentReplay.artifact.id, documentArtifact.artifact.id);

const renderedDocument = await renderSecretaryOfficeArtifact({ context, payload: { artifact_id: documentArtifact.artifact.id } });
assert.deepEqual(renderedDocument.files.map((file) => file.format), ["PDF", "DOCX", "PPTX"]);
for (const file of renderedDocument.files) {
  assert.ok(file.content_base64.length > 20);
  assert.ok(file.file_size_bytes > 20);
  assert.equal(file.checksum_sha256.length, 64);
  const bytes = Buffer.from(file.content_base64, "base64");
  if (file.format === "PDF") assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
  else assert.equal(bytes.readUInt32LE(0), 0x04034b50);
}

const preparedTextV2 = "Quarterly Operating Summary\nRevenue increased during the quarter.\nActions: review staffing, suppliers, and facilities.";
const sourceRevised = await reviseSecretaryDocumentPreparation({
  context,
  payload: {
    preparation_id: prep.preparation.id,
    prepared_text: preparedTextV2,
    change_scope: "POLISH_PRESERVE_MEANING",
    change_summary: "Explicit new source version.",
    instruction: "Use this supplied corrected final wording.",
    evidence_id: "office-artifact-source-revise-2",
    revised_at: "2036-01-10T01:20:00Z",
    expected_version: 2,
  },
});
assert.equal(sourceRevised.record.version, 3);
assert.equal(sourceRevised.record.state, "DRAFT");

const frozenRead = await readSecretaryOfficeArtifact({ context, payload: { artifact_id: documentArtifact.artifact.id } });
assert.equal(frozenRead.record.current_source_snapshot.exact_prepared_text, preparedTextV1);
assert.equal(frozenRead.record.version, 1);

await rejectsMessage(
  () => reviseSecretaryOfficeArtifact({
    context,
    payload: {
      artifact_id: documentArtifact.artifact.id,
      expected_version: 1,
      formats: ["PDF", "DOCX", "PPTX"],
      source_preparation_id: prep.preparation.id,
      source_preparation_version: 3,
      evidence_id: "office-artifact-revise-before-final",
      revised_at: "2036-01-10T01:21:00Z",
    },
  }),
  "SECRETARY_OFFICE_ARTIFACT_SOURCE_PREPARATION_NOT_FINAL",
);

const finalV2 = await finalizeSecretaryDocumentPreparation({
  context,
  payload: { preparation_id: prep.preparation.id, evidence_id: "office-artifact-source-final-2", finalized_at: "2036-01-10T01:25:00Z", expected_version: 3 },
});
assert.equal(finalV2.record.version, 4);

const documentRevised = await reviseSecretaryOfficeArtifact({
  context,
  payload: {
    artifact_id: documentArtifact.artifact.id,
    expected_version: 1,
    formats: ["PDF", "DOCX", "PPTX"],
    source_preparation_id: prep.preparation.id,
    source_preparation_version: 4,
    evidence_id: "office-artifact-doc-revise-1",
    revised_at: "2036-01-10T01:30:00Z",
  },
});
assert.equal(documentRevised.record.version, 2);
assert.equal(documentRevised.record.artifact_versions.length, 2);
assert.equal(documentRevised.record.artifact_versions[0].source_snapshot.exact_prepared_text, preparedTextV1);
assert.equal(documentRevised.record.current_source_snapshot.exact_prepared_text, preparedTextV2);

await rejectsMessage(
  () => reviseSecretaryOfficeArtifact({
    context,
    payload: {
      artifact_id: documentArtifact.artifact.id,
      expected_version: 1,
      formats: ["PDF"],
      source_preparation_id: prep.preparation.id,
      source_preparation_version: 4,
      evidence_id: "office-artifact-doc-stale",
      revised_at: "2036-01-10T01:31:00Z",
    },
  }),
  "SECRETARY_OFFICE_ARTIFACT_STALE_VERSION",
);

const spreadsheet = await prepareSecretaryOfficeArtifact({
  context,
  payload: {
    artifact_type: "SPREADSHEET",
    formats: ["XLSX"],
    title: "Secretary Follow-up Register",
    source_reference: "fixture:explicit-secretary-followups-v1",
    sheets: [{
      name: "Follow Ups",
      headers: ["Person", "Status", "Note"],
      rows: [
        ["Alice", "OPEN", "Call on Monday"],
        ["Bob", "DONE", "=SUM(A1:A2) must remain text"],
        ["Carol", "OPEN", 42],
      ],
    }],
    evidence_id: "office-artifact-sheet-1",
    prepared_at: "2036-01-10T02:00:00Z",
  },
});
assert.equal(spreadsheet.record.artifact_type, "SPREADSHEET");
assert.equal(spreadsheet.record.current_source_snapshot.formula_policy, "INLINE_VALUES_ONLY_NO_FORMULAS");

const renderedSpreadsheet = await renderSecretaryOfficeArtifact({ context, payload: { artifact_id: spreadsheet.artifact.id } });
assert.equal(renderedSpreadsheet.files.length, 1);
assert.equal(renderedSpreadsheet.files[0].format, "XLSX");
const xlsx = Buffer.from(renderedSpreadsheet.files[0].content_base64, "base64");
assert.equal(xlsx.readUInt32LE(0), 0x04034b50);
assert.equal(xlsx.includes(Buffer.from("xl/workbook.xml")), true);
assert.equal(xlsx.includes(Buffer.from("=SUM(A1:A2) must remain text")), true);
assert.equal(xlsx.includes(Buffer.from("<f>")), false);

for (const result of [documentArtifact, documentRevised, spreadsheet, renderedDocument, renderedSpreadsheet]) {
  assert.equal(result.source_snapshot_frozen, true);
  assert.equal(result.source_data_inferred, false);
  assert.equal(result.factual_accuracy_verified, false);
  assert.equal(result.legal_accuracy_verified, false);
  assert.equal(result.business_approval_inferred, false);
  assert.equal(result.spreadsheet_formula_execution_enabled, false);
  assert.equal(result.spreadsheet_formula_created, false);
  assert.equal(result.artifact_content_stored_in_database, false);
  assert.equal(result.artifact_bytes_persisted, false);
  assert.equal(result.external_storage_write_performed, false);
  assert.equal(result.document_published, false);
  assert.equal(result.document_filed, false);
  assert.equal(result.external_sharing_performed, false);
  assert.equal(result.correspondence_sent, false);
  assert.equal(result.signature_applied, false);
  assert.equal(result.binding_submission_performed, false);
  assert.equal(result.finance_posting_performed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

for (const action of ["prepare", "revise", "render", "cancel", "read", "list"]) {
  const capability = createSecretaryOfficeArtifactPreparationCapability(action);
  assert.equal(capability.manifest.aiEnabled, false);
  assert.equal(capability.manifest.operatorEnabled, true);
  assert.equal(capability.manifest.operatorAutoExecute, true);
  assert.equal(capability.manifest.operatorRequiresConfirmation, false);
  assert.equal(capability.manifest.approvalRequired, false);
}

console.log("SECRETARY_OFFICE_ARTIFACT_PREPARATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_OFFICE_ARTIFACT_REAL_PDF=true");
console.log("SECRETARY_OFFICE_ARTIFACT_REAL_DOCX=true");
console.log("SECRETARY_OFFICE_ARTIFACT_REAL_PPTX=true");
console.log("SECRETARY_OFFICE_ARTIFACT_REAL_XLSX=true");
console.log("SECRETARY_OFFICE_ARTIFACT_SOURCE_VERSION_FROZEN=true");
console.log("SECRETARY_OFFICE_ARTIFACT_REVISION_HISTORY_PRESERVED=true");
console.log("SECRETARY_OFFICE_ARTIFACT_STALE_VERSION_FENCED=true");
console.log("SECRETARY_OFFICE_ARTIFACT_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_OFFICE_ARTIFACT_SPREADSHEET_FORMULA_EXECUTION=false");
console.log("SECRETARY_OFFICE_ARTIFACT_EXTERNAL_STORAGE_WRITE_PERFORMED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_DOCUMENT_PUBLISHED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_DOCUMENT_FILED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_EXTERNAL_SHARING_PERFORMED=false");
console.log("SECRETARY_OFFICE_ARTIFACT_FINANCE_POSTING_PERFORMED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
