import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  readSecretaryContactRecordMaintenance,
  updateSecretaryContactRecord,
} from "../lib/operator/secretary/SecretaryContactRecordMaintenanceRuntime.js";

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected ${expected}`);
  assert.equal(caught.message, expected);
}

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const targetPartyId = randomUUID();
const collisionPartyId = randomUUID();
const context = {
  organizationId,
  timezone: "Asia/Bangkok",
  actor: { partyId: ownerPartyId },
  metadata: { partyId: ownerPartyId },
};

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Contact Maintenance Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: targetPartyId, organization_id: organizationId, display_name: "Alex Old", email: "alex-old@example.com", phone: "+66000000001", address: "Old Address", party_type: "PERSON", status: "ACTIVE" },
  { id: collisionPartyId, organization_id: organizationId, display_name: "Existing Contact", email: "existing@example.com", phone: "+66000000002", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());

const original = await one(supabaseAdmin.from("parties").select("*").eq("organization_id", organizationId).eq("id", targetPartyId).single());

const updated = await updateSecretaryContactRecord({
  context,
  payload: {
    party_id: targetPartyId,
    evidence_id: "contact-maintenance-evidence-1",
    evidence_at: "2035-07-01T03:00:00Z",
    expected_updated_at: original.updated_at,
    reason: "Contact supplied corrected details in an identified inbound message.",
    display_name: "Alex New",
    email: "alex-new@example.com",
    phone: "+66000000003",
    address: "New Address",
  },
});
assert.equal(updated.party.display_name, "Alex New");
assert.equal(updated.party.email, "alex-new@example.com");
assert.equal(updated.party.phone, "+66000000003");
assert.equal(updated.party.address, "New Address");
assert.equal(updated.maintenance.history.length, 1);
assert.equal(updated.maintenance.history[0].before.display_name, "Alex Old");
assert.equal(updated.maintenance.history[0].after.display_name, "Alex New");
assert.equal(updated.contact_value_inferred, false);
assert.equal(updated.identity_verified_inferred, false);
assert.equal(updated.party_merged, false);
assert.equal(updated.party_deleted, false);

const replay = await updateSecretaryContactRecord({
  context,
  payload: {
    party_id: targetPartyId,
    evidence_id: "contact-maintenance-evidence-1",
    evidence_at: "2035-07-01T03:00:00Z",
    expected_updated_at: original.updated_at,
    reason: "Contact supplied corrected details in an identified inbound message.",
    display_name: "Alex New",
    email: "alex-new@example.com",
    phone: "+66000000003",
    address: "New Address",
  },
});
assert.equal(replay.replay_safe, true);

await rejectsMessage(
  () => updateSecretaryContactRecord({
    context,
    payload: {
      party_id: targetPartyId,
      evidence_id: "contact-maintenance-stale",
      evidence_at: "2035-07-01T03:10:00Z",
      expected_updated_at: original.updated_at,
      reason: "Attempted stale correction.",
      phone: "+66000000004",
    },
  }),
  "SECRETARY_CONTACT_MAINTENANCE_STALE_RECORD",
);

const current = await one(supabaseAdmin.from("parties").select("*").eq("organization_id", organizationId).eq("id", targetPartyId).single());
await rejectsMessage(
  () => updateSecretaryContactRecord({
    context,
    payload: {
      party_id: targetPartyId,
      evidence_id: "contact-maintenance-email-collision",
      evidence_at: "2035-07-01T03:20:00Z",
      expected_updated_at: current.updated_at,
      reason: "Conflicting email should not silently merge contacts.",
      email: "existing@example.com",
    },
  }),
  "SECRETARY_CONTACT_MAINTENANCE_EMAIL_COLLISION",
);

await rejectsMessage(
  () => updateSecretaryContactRecord({
    context,
    payload: {
      party_id: targetPartyId,
      evidence_id: "contact-maintenance-phone-collision",
      evidence_at: "2035-07-01T03:25:00Z",
      expected_updated_at: current.updated_at,
      reason: "Conflicting phone should not silently merge contacts.",
      phone: "+66000000002",
    },
  }),
  "SECRETARY_CONTACT_MAINTENANCE_PHONE_COLLISION",
);

const cleared = await updateSecretaryContactRecord({
  context,
  payload: {
    party_id: targetPartyId,
    evidence_id: "contact-maintenance-clear-address",
    evidence_at: "2035-07-01T03:30:00Z",
    expected_updated_at: current.updated_at,
    reason: "Contact explicitly states the prior mailing address is no longer valid and no replacement address is supplied.",
    clear_fields: ["address"],
  },
});
assert.equal(cleared.party.address, null);
assert.equal(cleared.maintenance.history.length, 2);

const read = await readSecretaryContactRecordMaintenance({ context, payload: { party_id: targetPartyId } });
assert.equal(read.party.id, targetPartyId);
assert.equal(read.maintenance.history.length, 2);
for (const result of [updated, cleared, read]) {
  assert.equal(result.contact_value_inferred, false);
  assert.equal(result.identity_verified_inferred, false);
  assert.equal(result.party_merged, false);
  assert.equal(result.party_deleted, false);
  assert.equal(result.relationship_inferred, false);
  assert.equal(result.consent_inferred, false);
  assert.equal(result.communication_sent, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_CONTACT_RECORD_MAINTENANCE_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_CONTACT_MAINTENANCE_EXISTING_PARTY_ONLY=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_BEFORE_AFTER_HISTORY=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_EXPLICIT_CLEAR_SUPPORTED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_STALE_UPDATE_FENCED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_EMAIL_COLLISION_BLOCKED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_PHONE_COLLISION_BLOCKED=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_CONTACT_MAINTENANCE_CONTACT_VALUE_INFERRED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_IDENTITY_VERIFIED_INFERRED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_PARTY_MERGED=false");
console.log("SECRETARY_CONTACT_MAINTENANCE_PARTY_DELETED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
