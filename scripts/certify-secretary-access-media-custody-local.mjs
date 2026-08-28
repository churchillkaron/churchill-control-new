import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  registerSecretaryAccessMediaCustody,
  issueSecretaryAccessMedia,
  initiateSecretaryAccessMediaTransfer,
  acknowledgeSecretaryAccessMediaTransfer,
  returnSecretaryAccessMediaToStorage,
  markSecretaryAccessMediaMissing,
  recoverSecretaryAccessMedia,
  refreshSecretaryAccessMediaCustody,
  readSecretaryAccessMediaCustody,
} from "../lib/operator/secretary/SecretaryAccessMediaCustodyRuntime.js";
import { createSecretaryPhysicalKeyBadgeCustodyCapability } from "../lib/platform/capabilities/createSecretaryPhysicalKeyBadgeCustodyCapability.js";

async function one(result, label) { const resolved = await result; if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`); return resolved.data || null; }
async function many(result, label) { const resolved = await result; if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`); return Array.isArray(resolved.data) ? resolved.data : []; }

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const holderA = randomUUID();
const holderB = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId, localCertification: true } };

try {
  await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Access Media Custody Local Cert" }).select("*").single(), "SECRETARY_ACCESS_MEDIA_ORG_INSERT_FAILED");
  for (const [id, name, email] of [
    [ownerPartyId, "Executive Owner", "access-owner@example.invalid"],
    [holderA, "Holder A", "access-holder-a@example.invalid"],
    [holderB, "Holder B", "access-holder-b@example.invalid"],
  ]) {
    await one(supabaseAdmin.from("parties").insert({ id, organization_id: organizationId, display_name: name, email, party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } }).select("*").single(), "SECRETARY_ACCESS_MEDIA_PARTY_INSERT_FAILED");
  }
  await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId, local_certification: true } }).select("*").single(), "SECRETARY_ACCESS_MEDIA_SETTINGS_INSERT_FAILED");
  await many(supabaseAdmin.from("secretary_contact_profiles").insert([
    { organization_id: organizationId, party_id: holderA, preferred_channel: "email", metadata: { local_certification: true } },
    { organization_id: organizationId, party_id: holderB, preferred_channel: "email", metadata: { local_certification: true } },
  ]).select("id"), "SECRETARY_ACCESS_MEDIA_PROFILE_INSERT_FAILED");

  let secretBlocked = false;
  try {
    await registerSecretaryAccessMediaCustody({ context, payload: { label: "Forbidden secret fixture", media_kind: "KEY", storage_location: "Key Cabinet", pin: "1234", evidence_id: "access-secret-block", occurred_at: "2035-09-01T08:00:00Z" } });
  } catch (error) {
    secretBlocked = error?.message === "SECRETARY_ACCESS_MEDIA_CREDENTIAL_SECRET_FORBIDDEN";
  }
  assert.equal(secretBlocked, true);

  const registered = await registerSecretaryAccessMediaCustody({ context, payload: {
    label: "Executive Office Master Key",
    media_kind: "KEY",
    media_reference: "KEY-EXEC-01",
    storage_location: "Secretary Key Cabinet / Slot 01",
    evidence_id: "access-register-1",
    occurred_at: "2035-09-01T09:00:00Z",
  } });
  assert.equal(registered.record.state, "STORED");
  assert.equal(registered.record.version, 1);
  assert.equal(registered.access_permission_granted, false);
  assert.equal(registered.credential_secret_stored, false);

  const replay = await registerSecretaryAccessMediaCustody({ context, payload: {
    label: "Executive Office Master Key",
    media_kind: "KEY",
    media_reference: "KEY-EXEC-01",
    storage_location: "Secretary Key Cabinet / Slot 01",
    evidence_id: "access-register-1",
    occurred_at: "2035-09-01T09:00:00Z",
  } });
  assert.equal(replay.replay_safe, true);

  const issued = await issueSecretaryAccessMedia({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 1,
    holder_party_id: holderA,
    expected_return_at: "2035-09-03T17:00:00Z",
    source_reference: "handoff-log://key-to-holder-a",
    evidence_id: "access-issue-a",
    occurred_at: "2035-09-01T10:00:00Z",
  } });
  assert.equal(issued.record.state, "ISSUED");
  assert.equal(issued.record.version, 2);
  assert.equal(issued.record.current_holder_party_id, holderA);

  const refresh1 = await refreshSecretaryAccessMediaCustody({ context, payload: { custody_id: registered.record.custody_id } });
  const refresh2 = await refreshSecretaryAccessMediaCustody({ context, payload: { custody_id: registered.record.custody_id } });
  assert.equal(refresh1.follow_up_count, 1);
  assert.deepEqual(refresh1.follow_up_ids, refresh2.follow_up_ids);

  let staleFenced = false;
  try {
    await returnSecretaryAccessMediaToStorage({ context, payload: {
      custody_id: registered.record.custody_id,
      expected_version: 1,
      storage_location: "Secretary Key Cabinet / Slot 01",
      source_reference: "return-log://stale",
      evidence_id: "access-return-stale",
      occurred_at: "2035-09-01T11:00:00Z",
    } });
  } catch (error) {
    staleFenced = error?.message === "SECRETARY_ACCESS_MEDIA_STALE_VERSION";
  }
  assert.equal(staleFenced, true);

  const transfer = await initiateSecretaryAccessMediaTransfer({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 2,
    to_party_id: holderB,
    acknowledgement_due_at: "2035-09-02T12:00:00Z",
    source_reference: "handoff-log://a-to-b",
    evidence_id: "access-transfer-a-b",
    occurred_at: "2035-09-01T12:00:00Z",
  } });
  assert.equal(transfer.record.state, "IN_TRANSFER");
  assert.equal(transfer.record.version, 3);
  assert.equal(transfer.record.pending_transfer.to_party_id, holderB);

  const transferRefresh1 = await refreshSecretaryAccessMediaCustody({ context, payload: { custody_id: registered.record.custody_id } });
  const transferRefresh2 = await refreshSecretaryAccessMediaCustody({ context, payload: { custody_id: registered.record.custody_id } });
  assert.equal(transferRefresh1.follow_up_count, 1);
  assert.deepEqual(transferRefresh1.follow_up_ids, transferRefresh2.follow_up_ids);
  assert.notDeepEqual(refresh1.follow_up_ids, transferRefresh1.follow_up_ids);

  const acknowledged = await acknowledgeSecretaryAccessMediaTransfer({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 3,
    acknowledged_by_party_id: holderB,
    source_reference: "ack-log://holder-b",
    evidence_id: "access-transfer-ack-b",
    occurred_at: "2035-09-01T13:00:00Z",
  } });
  assert.equal(acknowledged.record.state, "ISSUED");
  assert.equal(acknowledged.record.version, 4);
  assert.equal(acknowledged.record.current_holder_party_id, holderB);

  const missing = await markSecretaryAccessMediaMissing({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 4,
    source_reference: "incident-note://holder-b-reported-missing",
    evidence_id: "access-missing-explicit",
    occurred_at: "2035-09-02T09:00:00Z",
  } });
  assert.equal(missing.record.state, "MISSING");
  assert.equal(missing.record.version, 5);
  assert.equal(missing.missing_status_inferred, false);
  assert.equal(missing.security_incident_declared, false);

  const recovered = await recoverSecretaryAccessMedia({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 5,
    storage_location: "Secretary Key Cabinet / Slot 01",
    source_reference: "recovery-log://returned-to-cabinet",
    evidence_id: "access-recovered-explicit",
    occurred_at: "2035-09-02T10:00:00Z",
  } });
  assert.equal(recovered.record.state, "STORED");
  assert.equal(recovered.record.version, 6);

  const issuedAgain = await issueSecretaryAccessMedia({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 6,
    holder_party_id: holderB,
    expected_return_at: "2035-09-04T17:00:00Z",
    source_reference: "handoff-log://key-to-holder-b-again",
    evidence_id: "access-issue-b-again",
    occurred_at: "2035-09-02T11:00:00Z",
  } });
  assert.equal(issuedAgain.record.version, 7);
  const returnRefresh = await refreshSecretaryAccessMediaCustody({ context, payload: { custody_id: registered.record.custody_id } });
  assert.equal(returnRefresh.follow_up_count, 1);

  const returned = await returnSecretaryAccessMediaToStorage({ context, payload: {
    custody_id: registered.record.custody_id,
    expected_version: 7,
    storage_location: "Secretary Key Cabinet / Slot 01",
    source_reference: "return-log://holder-b-to-cabinet",
    evidence_id: "access-return-explicit",
    occurred_at: "2035-09-02T12:00:00Z",
  } });
  assert.equal(returned.record.state, "STORED");
  assert.equal(returned.record.version, 8);
  assert.equal(returned.access_permission_revoked, false);
  assert.equal(returned.credential_deactivated, false);

  const finalRead = await readSecretaryAccessMediaCustody({ context, payload: { custody_id: registered.record.custody_id } });
  assert.equal(finalRead.record.state, "STORED");
  assert.equal(finalRead.record.custody_history.length >= 6, true);
  assert.equal(finalRead.record.missing_history.length, 2);
  assert.equal(finalRead.custody_inferred, false);
  assert.equal(finalRead.physical_access_granted, false);
  assert.equal(finalRead.access_permission_granted, false);
  assert.equal(finalRead.access_permission_revoked, false);
  assert.equal(finalRead.access_control_system_mutated, false);
  assert.equal(finalRead.credential_activated, false);
  assert.equal(finalRead.credential_deactivated, false);
  assert.equal(finalRead.credential_secret_stored, false);
  assert.equal(finalRead.identity_verified_inferred, false);
  assert.equal(finalRead.platform_permissions_mutated, false);
  assert.equal(finalRead.provider_calls_performed, false);
  assert.equal(finalRead.external_authority_used, false);

  const followUps = await many(supabaseAdmin.from("secretary_follow_ups").select("id,status,metadata").eq("organization_id", organizationId).eq("task_id", registered.record.custody_id), "SECRETARY_ACCESS_MEDIA_FOLLOW_UP_READ_FAILED");
  assert.ok(followUps.length >= 3);
  assert.ok(followUps.every((row) => row.status === "CANCELLED"));

  for (const action of ["register", "issue", "initiateTransfer", "acknowledgeTransfer", "returnToStorage", "markMissing", "recover", "refresh", "cancel", "read", "list"]) {
    const capability = createSecretaryPhysicalKeyBadgeCustodyCapability(action);
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
    assert.equal(capability.manifest.approvalRequired, false);
  }

  console.log("SECRETARY_ACCESS_MEDIA_CUSTODY_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_ACCESS_MEDIA_REGISTER_EVIDENCE=true");
  console.log("SECRETARY_ACCESS_MEDIA_ISSUE_EVIDENCE=true");
  console.log("SECRETARY_ACCESS_MEDIA_DETERMINISTIC_FOLLOW_UPS=true");
  console.log("SECRETARY_ACCESS_MEDIA_TRANSFER_ACK_REQUIRED=true");
  console.log("SECRETARY_ACCESS_MEDIA_RETURN_EVIDENCE=true");
  console.log("SECRETARY_ACCESS_MEDIA_MISSING_EXCEPTION_EXPLICIT=true");
  console.log("SECRETARY_ACCESS_MEDIA_RECOVERY_EVIDENCE=true");
  console.log("SECRETARY_ACCESS_MEDIA_STALE_VERSION_FENCED=true");
  console.log("SECRETARY_ACCESS_MEDIA_EVIDENCE_REPLAY_SAFE=true");
  console.log("SECRETARY_ACCESS_MEDIA_CREDENTIAL_SECRET_FORBIDDEN=true");
  console.log("SECRETARY_ACCESS_MEDIA_TERMINAL_FOLLOW_UPS_CANCELLED=true");
  console.log("SECRETARY_ACCESS_MEDIA_CUSTODY_INFERRED=false");
  console.log("SECRETARY_ACCESS_MEDIA_MISSING_STATUS_INFERRED=false");
  console.log("SECRETARY_ACCESS_MEDIA_PHYSICAL_ACCESS_GRANTED=false");
  console.log("SECRETARY_ACCESS_MEDIA_ACCESS_PERMISSION_GRANTED=false");
  console.log("SECRETARY_ACCESS_MEDIA_ACCESS_PERMISSION_REVOKED=false");
  console.log("SECRETARY_ACCESS_MEDIA_ACCESS_CONTROL_SYSTEM_MUTATED=false");
  console.log("SECRETARY_ACCESS_MEDIA_CREDENTIAL_ACTIVATED=false");
  console.log("SECRETARY_ACCESS_MEDIA_CREDENTIAL_DEACTIVATED=false");
  console.log("SECRETARY_ACCESS_MEDIA_CREDENTIAL_SECRET_STORED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
}
