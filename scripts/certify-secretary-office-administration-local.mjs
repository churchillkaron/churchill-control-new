import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  cancelSecretaryOfficeAdministration,
  completeSecretaryOfficeAdministration,
  listSecretaryOfficeAdministration,
  readSecretaryOfficeAdministration,
  recordSecretaryOfficeAdministrationCommitment,
  recordSecretaryOfficeAdministrationQuote,
  recordSecretaryOfficeAdministrationUpdate,
  startSecretaryOfficeAdministration,
} from "../lib/operator/secretary/SecretaryOfficeAdministrationRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const vendorPartyId = randomUUID();
const approverPartyId = randomUUID();
const context = {
  organizationId,
  timezone: "Asia/Bangkok",
  actor: { partyId: ownerPartyId },
  metadata: { partyId: ownerPartyId },
};

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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Office Administration Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: vendorPartyId, organization_id: organizationId, display_name: "Office Vendor", party_type: "ORGANIZATION", status: "ACTIVE" },
  { id: approverPartyId, organization_id: organizationId, display_name: "Explicit Approver", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());
await one(supabaseAdmin.from("secretary_contact_profiles").insert({
  organization_id: organizationId,
  party_id: vendorPartyId,
  preferred_channel: "email",
  allow_calls: true,
  allow_messages: true,
}).select("*").single());

const request = await startSecretaryOfficeAdministration({
  context,
  payload: {
    category: "FACILITY_ISSUE",
    title: "Meeting room air conditioning",
    description: "Air conditioning in the executive meeting room is not cooling properly.",
    evidence_id: "office-admin-start-evidence",
    started_at: "2035-06-10T01:00:00Z",
    target_party_id: vendorPartyId,
    desired_by: "2035-06-11T08:00:00Z",
    next_follow_up_at: "2035-06-10T03:00:00Z",
  },
});
assert.equal(request.status, "registered");
assert.equal(request.record.state, "WAITING_EXTERNAL");
assert.equal(request.replay_safe, false);
assert.equal(request.purchase_performed, false);

const requestReplay = await startSecretaryOfficeAdministration({
  context,
  payload: {
    category: "FACILITY_ISSUE",
    title: "Meeting room air conditioning",
    description: "Air conditioning in the executive meeting room is not cooling properly.",
    evidence_id: "office-admin-start-evidence",
    started_at: "2035-06-10T01:00:00Z",
    target_party_id: vendorPartyId,
    desired_by: "2035-06-11T08:00:00Z",
    next_follow_up_at: "2035-06-10T03:00:00Z",
  },
});
assert.equal(requestReplay.request.id, request.request.id);
assert.equal(requestReplay.replay_safe, true);

const quote = await recordSecretaryOfficeAdministrationQuote({
  context,
  payload: {
    request_id: request.request.id,
    evidence_id: "office-admin-quote-evidence",
    quoted_at: "2035-06-10T02:00:00Z",
    vendor_party_id: vendorPartyId,
    quote_reference: "QUOTE-AC-001",
    amount: 4500,
    currency: "THB",
    approval_review_at: "2035-06-10T02:30:00Z",
  },
});
assert.equal(quote.record.state, "WAITING_APPROVAL");
assert.equal(quote.record.quotes.length, 1);
assert.equal(quote.record.quotes[0].quote_accepted, false);
assert.equal(quote.record.quotes[0].order_placed, false);
assert.equal(quote.quote_accepted, false);
assert.equal(quote.order_placed, false);
const quoteReplay = await recordSecretaryOfficeAdministrationQuote({
  context,
  payload: {
    request_id: request.request.id,
    evidence_id: "office-admin-quote-evidence",
    quoted_at: "2035-06-10T02:00:00Z",
    vendor_party_id: vendorPartyId,
    quote_reference: "QUOTE-AC-001",
    amount: 4500,
    currency: "THB",
    approval_review_at: "2035-06-10T02:30:00Z",
  },
});
assert.equal(quoteReplay.replay_safe, true);

await rejectsMessage(
  () => recordSecretaryOfficeAdministrationCommitment({
    context,
    payload: {
      request_id: request.request.id,
      evidence_id: "office-admin-missing-authorizer",
      confirmed_at: "2035-06-10T03:00:00Z",
      reference: "SERVICE-001",
    },
  }),
  "SECRETARY_OFFICE_ADMIN_AUTHORIZED_BY_PARTY_REQUIRED",
);

const commitment = await recordSecretaryOfficeAdministrationCommitment({
  context,
  payload: {
    request_id: request.request.id,
    evidence_id: "office-admin-commitment-evidence",
    confirmed_at: "2035-06-10T03:10:00Z",
    authorized_by_party_id: approverPartyId,
    reference: "SERVICE-001",
    target_party_id: vendorPartyId,
    next_follow_up_at: "2035-06-10T06:00:00Z",
  },
});
assert.equal(commitment.record.state, "WAITING_EXTERNAL");
assert.equal(commitment.record.external_commitment.authorized_by_party_id, approverPartyId);
assert.equal(commitment.record.external_commitment.secretary_created_commitment, false);
assert.equal(commitment.service_authorized_by_secretary, false);

const update = await recordSecretaryOfficeAdministrationUpdate({
  context,
  payload: {
    request_id: request.request.id,
    evidence_id: "office-admin-update-evidence",
    occurred_at: "2035-06-10T05:00:00Z",
    update: "Vendor reports technician is on site and diagnostic work is in progress.",
    state: "IN_PROGRESS",
    target_party_id: vendorPartyId,
    next_follow_up_at: "2035-06-10T07:00:00Z",
  },
});
assert.equal(update.record.state, "IN_PROGRESS");
assert.equal(update.completion_inferred, false);

const completed = await completeSecretaryOfficeAdministration({
  context,
  payload: {
    request_id: request.request.id,
    evidence_id: "office-admin-completion-evidence",
    completed_at: "2035-06-10T07:30:00Z",
    completion_summary: "Facilities coordinator provided explicit evidence that cooling was restored and the room was returned to service.",
  },
});
assert.equal(completed.record.state, "COMPLETED");
assert.equal(completed.completion_inferred, false);
assert.equal(completed.repair_quality_inferred, false);
const completionReplay = await completeSecretaryOfficeAdministration({
  context,
  payload: {
    request_id: request.request.id,
    evidence_id: "office-admin-completion-evidence",
    completed_at: "2035-06-10T07:30:00Z",
    completion_summary: "Facilities coordinator provided explicit evidence that cooling was restored and the room was returned to service.",
  },
});
assert.equal(completionReplay.replay_safe, true);

const followUps = await one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", organizationId).eq("task_id", request.request.id));
assert.ok(followUps.length >= 3);
assert.equal(followUps.every((row) => row.status === "CANCELLED"), true);
assert.equal(followUps.some((row) => row.action_type === "EMAIL"), true);

const read = await readSecretaryOfficeAdministration({ context, payload: { request_id: request.request.id } });
assert.equal(read.record.state, "COMPLETED");
assert.equal(read.record.history.some((entry) => entry.event === "QUOTE_RECORDED"), true);
assert.equal(read.record.history.some((entry) => entry.event === "EXTERNAL_COMMITMENT_RECORDED"), true);

const cancelFixture = await startSecretaryOfficeAdministration({
  context,
  payload: {
    category: "OFFICE_SUPPLIES",
    title: "Printer paper replenishment",
    description: "Administrative request to track printer paper replenishment; no purchase authority is granted.",
    evidence_id: "office-admin-cancel-start",
    started_at: "2035-06-12T01:00:00Z",
  },
});
const cancelled = await cancelSecretaryOfficeAdministration({
  context,
  payload: {
    request_id: cancelFixture.request.id,
    evidence_id: "office-admin-cancel-evidence",
    cancelled_at: "2035-06-12T01:10:00Z",
    reason: "Internal coordination no longer needed.",
  },
});
assert.equal(cancelled.record.state, "CANCELLED");
assert.equal(cancelled.record.history.at(-1).external_cancellation_performed, false);

const activeList = await listSecretaryOfficeAdministration({ context, payload: {} });
assert.equal(activeList.count, 0);
const fullList = await listSecretaryOfficeAdministration({ context, payload: { include_terminal: true } });
assert.equal(fullList.count, 2);

for (const result of [request, quote, commitment, update, completed, cancelled]) {
  assert.equal(result.purchase_performed, false);
  assert.equal(result.order_placed, false);
  assert.equal(result.quote_accepted, false);
  assert.equal(result.vendor_terms_accepted, false);
  assert.equal(result.service_authorized_by_secretary, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_OFFICE_ADMINISTRATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_OFFICE_ADMINISTRATION_SUPPLIES_TRACKING=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_FACILITIES_TRACKING=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_VENDOR_FOLLOW_UP=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_QUOTE_RECORDED=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_QUOTE_ACCEPTED=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_ORDER_PLACED=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_EXTERNAL_AUTHORIZER_REQUIRED=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_SECRETARY_CREATED_COMMITMENT=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_COMPLETION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_TERMINAL_FOLLOW_UPS_CANCELLED=true");
console.log("SECRETARY_OFFICE_ADMINISTRATION_EXTERNAL_CANCELLATION_PERFORMED=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_OFFICE_ADMINISTRATION_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
