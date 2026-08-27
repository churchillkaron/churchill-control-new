import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  requestSecretaryRecordsRetrieval,
  resolveSecretaryRecordsRetrieval,
  recordSecretaryRecordsRetrievalHandoff,
  readSecretaryRecordsRetrieval,
} from "../lib/operator/secretary/SecretaryRecordsRetrievalRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const recipientPartyId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function rejectsMessage(run, expected) { let caught = null; try { await run(); } catch (error) { caught = error; } assert.ok(caught); assert.equal(caught.message, expected); }

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Records Retrieval Local Cert" }).select("*").single());
for (const [id, name] of [[ownerPartyId, "Executive Owner"], [recipientPartyId, "Internal Recipient"]]) {
  await one(supabaseAdmin.from("parties").insert({ id, organization_id: organizationId, display_name: name, party_type: "PERSON", status: "ACTIVE" }).select("*").single());
}
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

async function filing({ key, title, category, versionRefs }) {
  const id = randomUUID();
  const versions = versionRefs.map((ref, index) => ({ version: index + 1, status: index === versionRefs.length - 1 ? "CURRENT" : "SUPERSEDED", source_reference: ref, original_filename: `${key}-v${index + 1}.pdf`, canonical_filename: `${key}-v${index + 1}.pdf`, filing_path: `records/${key}-v${index + 1}.pdf`, filed_at: `2035-07-0${index + 1}T00:00:00Z` }));
  await one(supabaseAdmin.from("secretary_tasks").insert({ id, organization_id: organizationId, owner_party_id: ownerPartyId, title: `File document: ${title}`, details: "fixture", status: "IN_PROGRESS", priority: "NORMAL", source: "secretary_document_filing", created_by_party_id: ownerPartyId, metadata: { secretary_document_filing: true, document_key: key, document_title: title, category, document_type: "REPORT", subject_reference: "board", filing_folder: "records", document_status: "FILED", current_version: versionRefs.length, versions } }).select("*").single());
  return id;
}

const alphaId = await filing({ key: "board-alpha", title: "Board Pack Alpha", category: "BOARD", versionRefs: ["ref://alpha-v1", "ref://alpha-v2"] });
await filing({ key: "board-beta", title: "Board Pack Beta", category: "BOARD", versionRefs: ["ref://beta-v1"] });

const ambiguous = await requestSecretaryRecordsRetrieval({ context, payload: { query: "Board Pack", evidence_id: "retrieval-ambiguous-1", requested_at: "2035-07-10T01:00:00Z" } });
assert.equal(ambiguous.record.state, "AMBIGUOUS");
assert.equal(ambiguous.record.candidates.length, 2);

const resolved = await resolveSecretaryRecordsRetrieval({ context, payload: { retrieval_id: ambiguous.retrieval.id, evidence_id: "retrieval-resolve-1", resolved_at: "2035-07-10T01:05:00Z", expected_version: 1, selected_document_id: alphaId, selected_version: 1 } });
assert.equal(resolved.record.state, "LOCATED");
assert.equal(resolved.record.located_reference.source_reference, "ref://alpha-v1");
assert.equal(resolved.record.located_reference.version, 1);

const replay = await resolveSecretaryRecordsRetrieval({ context, payload: { retrieval_id: ambiguous.retrieval.id, evidence_id: "retrieval-resolve-1", resolved_at: "2035-07-10T01:05:00Z", expected_version: 1, selected_document_id: alphaId, selected_version: 1 } });
assert.equal(replay.replay_safe, true);
await rejectsMessage(() => resolveSecretaryRecordsRetrieval({ context, payload: { retrieval_id: ambiguous.retrieval.id, evidence_id: "retrieval-resolve-conflict", resolved_at: "2035-07-10T01:06:00Z", expected_version: 1, selected_document_id: alphaId } }), "SECRETARY_RECORDS_RETRIEVAL_STALE_VERSION");

const handoff = await recordSecretaryRecordsRetrievalHandoff({ context, payload: { retrieval_id: ambiguous.retrieval.id, evidence_id: "retrieval-handoff-1", handed_off_at: "2035-07-10T01:10:00Z", expected_version: 2, recipient_party_id: recipientPartyId, channel: "INTERNAL", note: "Reference returned to requester" } });
assert.equal(handoff.record.state, "FULFILLED");
assert.equal(handoff.record.handoff.reference_only, true);

const missing = await requestSecretaryRecordsRetrieval({ context, payload: { document_key: "missing-key", evidence_id: "retrieval-missing-1", requested_at: "2035-07-11T01:00:00Z" } });
assert.equal(missing.record.state, "NOT_FOUND");

const exact = await requestSecretaryRecordsRetrieval({ context, payload: { document_id: alphaId, requested_version: 2, evidence_id: "retrieval-exact-1", requested_at: "2035-07-12T01:00:00Z" } });
assert.equal(exact.record.state, "LOCATED");
assert.equal(exact.record.located_reference.source_reference, "ref://alpha-v2");

const read = await readSecretaryRecordsRetrieval({ context, payload: { retrieval_id: ambiguous.retrieval.id } });
assert.equal(read.record.state, "FULFILLED");
for (const result of [ambiguous, resolved, handoff, missing, exact, read]) {
  assert.equal(result.external_storage_access_performed, false);
  assert.equal(result.file_content_read, false);
  assert.equal(result.access_permission_bypassed, false);
  assert.equal(result.external_sharing_performed, false);
  assert.equal(result.source_document_modified, false);
  assert.equal(result.source_document_deleted, false);
  assert.equal(result.retention_decision_made, false);
  assert.equal(result.archive_deletion_performed, false);
  assert.equal(result.legal_hold_changed, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_RECORDS_RETRIEVAL_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_RECORDS_RETRIEVAL_AMBIGUITY_FAILS_CLOSED=true");
console.log("SECRETARY_RECORDS_RETRIEVAL_NOT_FOUND_EXPLICIT=true");
console.log("SECRETARY_RECORDS_RETRIEVAL_EXACT_VERSION_SUPPORTED=true");
console.log("SECRETARY_RECORDS_RETRIEVAL_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_RECORDS_RETRIEVAL_STALE_VERSION_FENCED=true");
console.log("SECRETARY_RECORDS_RETRIEVAL_REFERENCE_HANDOFF_ONLY=true");
console.log("SECRETARY_RECORDS_RETRIEVAL_EXTERNAL_STORAGE_ACCESS_PERFORMED=false");
console.log("SECRETARY_RECORDS_RETRIEVAL_FILE_CONTENT_READ=false");
console.log("SECRETARY_RECORDS_RETRIEVAL_ACCESS_PERMISSION_BYPASSED=false");
console.log("SECRETARY_RECORDS_RETRIEVAL_RETENTION_DECISION_MADE=false");
console.log("SECRETARY_RECORDS_RETRIEVAL_ARCHIVE_DELETION_PERFORMED=false");
console.log("SECRETARY_RECORDS_RETRIEVAL_EXTERNAL_SHARING_PERFORMED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
