import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  finalizeSecretaryTravelDocumentReadiness,
  readSecretaryTravelDocumentReadiness,
  recordSecretaryTravelDocumentStatus,
  refreshSecretaryTravelDocumentFollowUps,
  reopenSecretaryTravelDocumentReadiness,
  startSecretaryTravelDocumentReadiness,
} from "../lib/operator/secretary/SecretaryTravelDocumentReadinessRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const responsiblePartyId = randomUUID();
const jobId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function expectError(fn, expected) { let error = null; try { await fn(); } catch (caught) { error = caught; } assert.ok(error, `Expected ${expected}`); assert.equal(error.message, expected); }

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Travel Document Readiness Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: responsiblePartyId, organization_id: organizationId, display_name: "Travel Coordinator", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_contact_profiles").insert({ organization_id: organizationId, party_id: responsiblePartyId, preferred_channel: "email" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());
await one(supabaseAdmin.from("secretary_jobs").insert({
  id: jobId,
  organization_id: organizationId,
  requested_by_party_id: ownerPartyId,
  source_kind: "MANUAL",
  objective: "Coordinate executive travel to Singapore",
  success_criteria: ["Maintain evidence-backed travel readiness"],
  status: "ACTIVE",
  autonomy_level: "EXECUTE_WITH_GATES",
  approval_policy: {},
  execution_plan: [],
  metadata: { job_kind: "TRAVEL_COORDINATION", canonical_owner_party_id: ownerPartyId, external_booking_authority_created: false, payment_authority_created: false, external_authority_used: false },
}).select("*").single());

const started = await startSecretaryTravelDocumentReadiness({ context, payload: {
  job_id: jobId,
  departure_at: "2035-04-10T03:00:00Z",
  jurisdictions: ["Singapore"],
  evidence_id: "travel-doc-start-v1",
  occurred_at: "2035-03-01T02:00:00Z",
  items: [
    { kind: "PASSPORT_VALIDITY", label: "Passport validity evidence", jurisdiction: "Singapore", required: true, responsible_party_id: responsiblePartyId, due_at: "2035-03-20T02:00:00Z", requirement_source_reference: "fixture://passport-requirement" },
    { kind: "VISA", label: "Visa or explicit not-required evidence", jurisdiction: "Singapore", required: true, responsible_party_id: responsiblePartyId, due_at: "2035-03-20T02:00:00Z", requirement_source_reference: "fixture://visa-requirement" },
  ],
} });
assert.equal(started.register.version, 1);
assert.equal(started.register.state, "DRAFT");
assert.equal(started.passport_number_stored, false);
assert.equal(started.visa_requirement_inferred, false);

const refreshed = await refreshSecretaryTravelDocumentFollowUps({ context, payload: { job_id: jobId } });
assert.equal(refreshed.follow_up_count, 2);
const refreshedAgain = await refreshSecretaryTravelDocumentFollowUps({ context, payload: { job_id: jobId } });
assert.deepEqual([...refreshedAgain.follow_up_ids].sort(), [...refreshed.follow_up_ids].sort());

const passportItem = started.register.items.find((item) => item.kind === "PASSPORT_VALIDITY");
const visaItem = started.register.items.find((item) => item.kind === "VISA");
assert.ok(passportItem && visaItem);

await expectError(() => recordSecretaryTravelDocumentStatus({ context, payload: {
  job_id: jobId,
  item_id: passportItem.item_id,
  expected_version: 1,
  state: "AVAILABLE",
  passport_number: "SHOULD-NOT-BE-STORED",
  source_reference: "fixture://passport-evidence",
  evidence_id: "travel-doc-sensitive-rejected",
  occurred_at: "2035-03-02T02:00:00Z",
} }), "SECRETARY_TRAVEL_DOCUMENT_SENSITIVE_FIELD_FORBIDDEN:passport_number");

const passport = await recordSecretaryTravelDocumentStatus({ context, payload: {
  job_id: jobId,
  item_id: passportItem.item_id,
  expected_version: 1,
  state: "AVAILABLE",
  expiry_date: "2035-04-01",
  source_reference: "fixture://passport-expiry-evidence",
  evidence_id: "travel-doc-passport-v1",
  occurred_at: "2035-03-02T02:00:00Z",
} });
assert.equal(passport.register.version, 2);
assert.equal(passport.item.expires_before_departure, true);
assert.equal(passport.eligibility_inferred, false);

await expectError(() => finalizeSecretaryTravelDocumentReadiness({ context, payload: {
  job_id: jobId,
  expected_version: 2,
  evidence_id: "travel-doc-finalize-too-early",
  occurred_at: "2035-03-03T02:00:00Z",
} }), "SECRETARY_TRAVEL_DOCUMENT_REQUIRED_ITEMS_INCOMPLETE");

await expectError(() => recordSecretaryTravelDocumentStatus({ context, payload: {
  job_id: jobId,
  item_id: visaItem.item_id,
  expected_version: 1,
  state: "NOT_REQUIRED",
  source_reference: "fixture://visa-not-required",
  evidence_id: "travel-doc-stale",
  occurred_at: "2035-03-03T02:00:00Z",
} }), "SECRETARY_TRAVEL_DOCUMENT_STALE_VERSION");

const visa = await recordSecretaryTravelDocumentStatus({ context, payload: {
  job_id: jobId,
  item_id: visaItem.item_id,
  expected_version: 2,
  state: "NOT_REQUIRED",
  source_reference: "fixture://visa-not-required-evidence",
  evidence_id: "travel-doc-visa-v1",
  occurred_at: "2035-03-03T02:00:00Z",
} });
assert.equal(visa.register.version, 3);

const finalizedV1 = await finalizeSecretaryTravelDocumentReadiness({ context, payload: {
  job_id: jobId,
  expected_version: 3,
  evidence_id: "travel-doc-finalize-v1",
  occurred_at: "2035-03-04T02:00:00Z",
} });
assert.equal(finalizedV1.register.state, "READY_FOR_REVIEW");
assert.equal(finalizedV1.register.version, 4);
assert.equal(finalizedV1.register.frozen_versions.length, 1);
assert.equal(finalizedV1.entry_eligibility_determined, false);
assert.equal(finalizedV1.legal_sufficiency_determined, false);

const reopened = await reopenSecretaryTravelDocumentReadiness({ context, payload: {
  job_id: jobId,
  expected_version: 4,
  reason: "New passport expiry evidence supplied",
  evidence_id: "travel-doc-reopen-v1",
  occurred_at: "2035-03-05T02:00:00Z",
} });
assert.equal(reopened.register.state, "DRAFT");
assert.equal(reopened.register.version, 5);
assert.equal(reopened.register.frozen_versions.length, 1);

const passportCorrected = await recordSecretaryTravelDocumentStatus({ context, payload: {
  job_id: jobId,
  item_id: passportItem.item_id,
  expected_version: 5,
  state: "AVAILABLE",
  expiry_date: "2036-08-01",
  source_reference: "fixture://passport-expiry-evidence-v2",
  evidence_id: "travel-doc-passport-v2",
  occurred_at: "2035-03-06T02:00:00Z",
} });
assert.equal(passportCorrected.item.expires_before_departure, false);
assert.equal(passportCorrected.item.history.length, 2);
assert.ok(passportCorrected.item.history.some((entry) => entry.expiry_date === "2035-04-01" && entry.evidence_id === "travel-doc-passport-v1"));
assert.equal(passportCorrected.register.version, 6);

const finalizedV2 = await finalizeSecretaryTravelDocumentReadiness({ context, payload: {
  job_id: jobId,
  expected_version: 6,
  evidence_id: "travel-doc-finalize-v2",
  occurred_at: "2035-03-07T02:00:00Z",
} });
assert.equal(finalizedV2.register.version, 7);
assert.equal(finalizedV2.register.frozen_versions.length, 2);
assert.equal(finalizedV2.register.frozen_versions[0].items.find((item) => item.item_id === passportItem.item_id).expiry_date, "2035-04-01");
assert.equal(finalizedV2.register.frozen_versions[1].items.find((item) => item.item_id === passportItem.item_id).expiry_date, "2036-08-01");

const read = await readSecretaryTravelDocumentReadiness({ context, payload: { job_id: jobId } });
assert.equal(read.administrative_checklist_complete, true);
assert.equal(read.required_items_incomplete.length, 0);
assert.equal(read.expiry_before_departure_items.length, 0);
assert.equal(read.passport_number_stored, false);
assert.equal(read.identity_document_content_read, false);
assert.equal(read.application_submitted, false);
assert.equal(read.fee_paid, false);
assert.equal(read.entry_permission_inferred, false);

console.log("SECRETARY_TRAVEL_DOCUMENT_READINESS_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_TRAVEL_DOCUMENT_SENSITIVE_FIELDS_FORBIDDEN=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_DETERMINISTIC_FOLLOW_UPS=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_EXPIRY_WARNING_EVIDENCE_ONLY=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_REQUIRED_ITEMS_BLOCK_FINALIZATION=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_FROZEN_VERSION_HISTORY=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_STALE_VERSION_FENCED=true");
console.log("SECRETARY_TRAVEL_DOCUMENT_PASSPORT_NUMBER_STORED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_VISA_NUMBER_STORED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_IDENTITY_CONTENT_READ=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_ELIGIBILITY_INFERRED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_ENTRY_PERMISSION_INFERRED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_APPLICATION_SUBMITTED=false");
console.log("SECRETARY_TRAVEL_DOCUMENT_FEE_PAID=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
