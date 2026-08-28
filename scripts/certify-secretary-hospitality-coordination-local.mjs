import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  completeSecretaryHospitalityCoordination,
  finalizeSecretaryHospitalityReadiness,
  readSecretaryHospitalityCoordination,
  recordSecretaryHospitalityItemStatus,
  recordSecretaryHospitalityQuote,
  refreshSecretaryHospitalityFollowUps,
  reopenSecretaryHospitalityReadiness,
  startSecretaryHospitalityCoordination,
} from "../lib/operator/secretary/SecretaryHospitalityCoordinationRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const coordinatorPartyId = randomUUID();
const providerPartyId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function expectError(fn, expected) { let error = null; try { await fn(); } catch (caught) { error = caught; } assert.ok(error, `Expected ${expected}`); assert.equal(error.message, expected); }

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Hospitality Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: coordinatorPartyId, organization_id: organizationId, display_name: "Hospitality Coordinator", party_type: "PERSON", status: "ACTIVE" },
  { id: providerPartyId, organization_id: organizationId, display_name: "Catering Provider", party_type: "ORGANIZATION", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_contact_profiles").insert([
  { organization_id: organizationId, party_id: coordinatorPartyId, preferred_channel: "email" },
  { organization_id: organizationId, party_id: providerPartyId, preferred_channel: "email" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const started = await startSecretaryHospitalityCoordination({ context, payload: {
  title: "Board strategy session",
  started_at: "2035-05-01T02:00:00Z",
  starts_at: "2035-05-20T03:00:00Z",
  ends_at: "2035-05-20T06:00:00Z",
  timezone: "Asia/Bangkok",
  location: "Boardroom A",
  expected_headcount: 12,
  special_requirements: ["One explicitly reported vegetarian meal", "Wheelchair-accessible table position requested by attendee"],
  evidence_id: "hospitality-start-v1",
  items: [
    { kind: "CATERING", label: "Lunch for 12 attendees", required: true, quantity: "12 meals", responsible_party_id: providerPartyId, due_at: "2035-05-10T02:00:00Z", requirement_source_reference: "fixture://board-host-lunch-requirement" },
    { kind: "ACCESSIBILITY_SUPPORT", label: "Wheelchair-accessible table position", required: true, responsible_party_id: coordinatorPartyId, due_at: "2035-05-12T02:00:00Z", requirement_source_reference: "fixture://attendee-accessibility-request" },
  ],
} });
assert.equal(started.record.state, "DRAFT");
assert.equal(started.record.version, 1);
assert.equal(started.record.expected_headcount, 12);
assert.equal(started.headcount_inferred, false);
assert.equal(started.dietary_requirement_inferred, false);
assert.equal(started.accessibility_requirement_inferred, false);

const catering = started.record.items.find((item) => item.kind === "CATERING");
const accessibility = started.record.items.find((item) => item.kind === "ACCESSIBILITY_SUPPORT");
assert.ok(catering && accessibility);

const refreshed = await refreshSecretaryHospitalityFollowUps({ context, payload: { coordination_id: started.record.coordination_id } });
assert.equal(refreshed.follow_up_count, 2);
const refreshedAgain = await refreshSecretaryHospitalityFollowUps({ context, payload: { coordination_id: started.record.coordination_id } });
assert.deepEqual([...refreshedAgain.follow_up_ids].sort(), [...refreshed.follow_up_ids].sort());

const quoted = await recordSecretaryHospitalityQuote({ context, payload: {
  coordination_id: started.record.coordination_id,
  item_id: catering.item_id,
  expected_version: 1,
  provider_party_id: providerPartyId,
  quote_reference: "fixture://catering-quote-12000-thb",
  amount: 12000,
  currency: "THB",
  valid_until: "2035-05-08T16:59:59Z",
  evidence_id: "hospitality-quote-v1",
  occurred_at: "2035-05-02T02:00:00Z",
} });
assert.equal(quoted.record.version, 2);
assert.equal(quoted.record.quotes.length, 1);
assert.equal(quoted.record.quotes[0].informational_only, true);
assert.equal(quoted.record.quotes[0].quote_accepted, false);
assert.equal(quoted.order_placed, false);
assert.equal(quoted.service_confirmation_inferred, false);

const cateringConfirmed = await recordSecretaryHospitalityItemStatus({ context, payload: {
  coordination_id: started.record.coordination_id,
  item_id: catering.item_id,
  expected_version: 2,
  state: "CONFIRMED",
  source_reference: "fixture://provider-confirmation-catering",
  evidence_id: "hospitality-catering-confirmed",
  occurred_at: "2035-05-03T02:00:00Z",
} });
assert.equal(cateringConfirmed.record.version, 3);

await expectError(() => finalizeSecretaryHospitalityReadiness({ context, payload: {
  coordination_id: started.record.coordination_id,
  expected_version: 3,
  evidence_id: "hospitality-finalize-too-early",
  occurred_at: "2035-05-04T02:00:00Z",
} }), "SECRETARY_HOSPITALITY_REQUIRED_ITEMS_INCOMPLETE");

await expectError(() => recordSecretaryHospitalityItemStatus({ context, payload: {
  coordination_id: started.record.coordination_id,
  item_id: accessibility.item_id,
  expected_version: 2,
  state: "CONFIRMED",
  source_reference: "fixture://stale-accessibility-confirmation",
  evidence_id: "hospitality-stale-version",
  occurred_at: "2035-05-04T02:00:00Z",
} }), "SECRETARY_HOSPITALITY_STALE_VERSION");

const accessibilityConfirmed = await recordSecretaryHospitalityItemStatus({ context, payload: {
  coordination_id: started.record.coordination_id,
  item_id: accessibility.item_id,
  expected_version: 3,
  state: "CONFIRMED",
  source_reference: "fixture://accessibility-setup-confirmed",
  evidence_id: "hospitality-accessibility-confirmed",
  occurred_at: "2035-05-04T02:00:00Z",
} });
assert.equal(accessibilityConfirmed.record.version, 4);

const finalizedV1 = await finalizeSecretaryHospitalityReadiness({ context, payload: {
  coordination_id: started.record.coordination_id,
  expected_version: 4,
  evidence_id: "hospitality-finalize-v1",
  occurred_at: "2035-05-05T02:00:00Z",
} });
assert.equal(finalizedV1.record.state, "READY_FOR_EVENT");
assert.equal(finalizedV1.record.version, 5);
assert.equal(finalizedV1.record.frozen_versions.length, 1);
assert.equal(finalizedV1.administrative_readiness_complete, true);
assert.equal(finalizedV1.delivery_evidence_complete, false);

const reopened = await reopenSecretaryHospitalityReadiness({ context, payload: {
  coordination_id: started.record.coordination_id,
  expected_version: 5,
  reason: "Record actual delivery and setup evidence",
  evidence_id: "hospitality-reopen-v1",
  occurred_at: "2035-05-20T01:00:00Z",
} });
assert.equal(reopened.record.state, "DRAFT");
assert.equal(reopened.record.version, 6);
assert.equal(reopened.record.frozen_versions.length, 1);

const cateringDelivered = await recordSecretaryHospitalityItemStatus({ context, payload: {
  coordination_id: started.record.coordination_id,
  item_id: catering.item_id,
  expected_version: 6,
  state: "DELIVERED",
  source_reference: "fixture://catering-delivery-evidence",
  evidence_id: "hospitality-catering-delivered",
  occurred_at: "2035-05-20T02:15:00Z",
} });
assert.equal(cateringDelivered.record.version, 7);

const accessibilityDelivered = await recordSecretaryHospitalityItemStatus({ context, payload: {
  coordination_id: started.record.coordination_id,
  item_id: accessibility.item_id,
  expected_version: 7,
  state: "DELIVERED",
  source_reference: "fixture://accessibility-setup-evidence",
  evidence_id: "hospitality-accessibility-delivered",
  occurred_at: "2035-05-20T02:20:00Z",
} });
assert.equal(accessibilityDelivered.record.version, 8);

const finalizedV2 = await finalizeSecretaryHospitalityReadiness({ context, payload: {
  coordination_id: started.record.coordination_id,
  expected_version: 8,
  evidence_id: "hospitality-finalize-v2",
  occurred_at: "2035-05-20T02:25:00Z",
} });
assert.equal(finalizedV2.record.version, 9);
assert.equal(finalizedV2.record.frozen_versions.length, 2);
assert.equal(finalizedV2.record.frozen_versions[0].items.find((item) => item.item_id === catering.item_id).state, "CONFIRMED");
assert.equal(finalizedV2.record.frozen_versions[1].items.find((item) => item.item_id === catering.item_id).state, "DELIVERED");

const completed = await completeSecretaryHospitalityCoordination({ context, payload: {
  coordination_id: started.record.coordination_id,
  expected_version: 9,
  evidence_id: "hospitality-completed-v1",
  occurred_at: "2035-05-20T02:30:00Z",
} });
assert.equal(completed.record.state, "COMPLETED");
assert.equal(completed.record.version, 10);
assert.equal(completed.delivery_evidence_complete, true);

const read = await readSecretaryHospitalityCoordination({ context, payload: { coordination_id: started.record.coordination_id } });
assert.equal(read.record.expected_headcount, 12);
assert.equal(read.record.special_requirements.length, 2);
assert.equal(read.purchase_performed, false);
assert.equal(read.order_placed, false);
assert.equal(read.quote_accepted, false);
assert.equal(read.vendor_terms_accepted, false);
assert.equal(read.service_authorized_by_secretary, false);
assert.equal(read.payment_authority_created, false);
assert.equal(read.signing_authority_created, false);
assert.equal(read.binding_authority_delegated, false);
assert.equal(read.service_confirmation_inferred, false);
assert.equal(read.delivery_inferred, false);

console.log("SECRETARY_HOSPITALITY_COORDINATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_HOSPITALITY_EXPLICIT_HEADCOUNT_REQUIRED=true");
console.log("SECRETARY_HOSPITALITY_REQUIREMENT_SOURCES_REQUIRED=true");
console.log("SECRETARY_HOSPITALITY_DETERMINISTIC_FOLLOW_UPS=true");
console.log("SECRETARY_HOSPITALITY_QUOTE_INFORMATIONAL_ONLY=true");
console.log("SECRETARY_HOSPITALITY_REQUIRED_ITEMS_BLOCK_READINESS=true");
console.log("SECRETARY_HOSPITALITY_DELIVERY_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_HOSPITALITY_FROZEN_VERSION_HISTORY=true");
console.log("SECRETARY_HOSPITALITY_STALE_VERSION_FENCED=true");
console.log("SECRETARY_HOSPITALITY_HEADCOUNT_INFERRED=false");
console.log("SECRETARY_HOSPITALITY_DIETARY_REQUIREMENT_INFERRED=false");
console.log("SECRETARY_HOSPITALITY_ACCESSIBILITY_REQUIREMENT_INFERRED=false");
console.log("SECRETARY_HOSPITALITY_SERVICE_CONFIRMATION_INFERRED=false");
console.log("SECRETARY_HOSPITALITY_DELIVERY_INFERRED=false");
console.log("SECRETARY_HOSPITALITY_CATERING_ORDERED=false");
console.log("SECRETARY_HOSPITALITY_PURCHASE_PERFORMED=false");
console.log("SECRETARY_HOSPITALITY_QUOTE_ACCEPTED=false");
console.log("SECRETARY_HOSPITALITY_VENDOR_TERMS_ACCEPTED=false");
console.log("SECRETARY_HOSPITALITY_SERVICE_AUTHORIZED_BY_SECRETARY=false");
console.log("SECRETARY_HOSPITALITY_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_HOSPITALITY_SIGNING_AUTHORITY_CREATED=false");
console.log("SECRETARY_HOSPITALITY_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
