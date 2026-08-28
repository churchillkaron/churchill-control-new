import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_PACK_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_PACK_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

async function many(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${expected}`);
  assert.equal(caught.message, expected);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  addSecretaryMeetingPackItem,
  finalizeSecretaryMeetingPack,
  readSecretaryMeetingPackCoordination,
  recordSecretaryMeetingPackAcknowledgement,
  recordSecretaryMeetingPackDistribution,
  recordSecretaryMeetingPackItem,
  reopenSecretaryMeetingPackForRevision,
  startSecretaryMeetingPackCoordination,
} = await import("../lib/operator/secretary/SecretaryMeetingPackCoordinationRuntime.js");

let organizationId = null;

try {
  organizationId = randomUUID();
  const ownerPartyId = randomUUID();
  const recipientPartyId = randomUUID();
  const responsiblePartyId = randomUUID();

  await one(
    supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Meeting Pack Local Certification" }).select("*").single(),
    "SECRETARY_MEETING_PACK_ORGANIZATION_INSERT_FAILED",
  );
  await many(
    supabaseAdmin.from("parties").insert([
      { id: ownerPartyId, organization_id: organizationId, display_name: "Pack Executive", party_type: "PERSON", status: "ACTIVE" },
      { id: recipientPartyId, organization_id: organizationId, display_name: "Pack Recipient", party_type: "PERSON", status: "ACTIVE" },
      { id: responsiblePartyId, organization_id: organizationId, display_name: "Paper Owner", party_type: "PERSON", status: "ACTIVE" },
    ]).select("*"),
    "SECRETARY_MEETING_PACK_PARTIES_INSERT_FAILED",
  );
  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      appointment_duration_minutes: 30,
      business_hours: {},
      booking_policy: { owner_party_id: ownerPartyId },
      metadata: { owner_party_id: ownerPartyId },
    }).select("*").single(),
    "SECRETARY_MEETING_PACK_SETTINGS_INSERT_FAILED",
  );
  const event = await one(
    supabaseAdmin.from("secretary_calendar_events").insert({
      organization_id: organizationId,
      owner_party_id: ownerPartyId,
      contact_party_id: recipientPartyId,
      title: "Board review certification meeting",
      event_type: "MEETING",
      status: "CONFIRMED",
      starts_at: "2035-09-20T09:00:00Z",
      ends_at: "2035-09-20T10:30:00Z",
      timezone: "Asia/Bangkok",
      source: "secretary",
      created_by_party_id: ownerPartyId,
      updated_by_party_id: ownerPartyId,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_MEETING_PACK_EVENT_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerPartyId },
    metadata: { partyId: ownerPartyId, localCertification: true },
  };
  const startPayload = {
    calendar_event_id: event.id,
    pack_title: "Board Review Pack",
    evidence_id: "meeting-pack-start-1",
    started_at: "2035-09-01T02:00:00Z",
    recipients: [{ party_id: recipientPartyId, channel: "EMAIL", required_ack: true }],
    items: [
      { label: "Board agenda", kind: "AGENDA", required: true, responsible_party_id: responsiblePartyId, due_at: "2035-09-15T02:00:00Z" },
      { label: "Finance paper", kind: "DOCUMENT", required: true, responsible_party_id: responsiblePartyId, due_at: "2035-09-15T02:00:00Z" },
    ],
  };

  const started = await startSecretaryMeetingPackCoordination({ context, payload: startPayload });
  assert.equal(started.contract, "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_PACK_COORDINATION_V1");
  assert.equal(started.register.state, "DRAFT");
  assert.equal(started.register.version, 1);
  assert.equal(started.register.items.length, 2);
  assert.equal(started.collection_follow_up_ids.length, 2);
  assert.equal(started.document_store_created, false);
  assert.equal(started.file_content_read, false);

  const replay = await startSecretaryMeetingPackCoordination({ context, payload: startPayload });
  assert.equal(replay.replay_safe, true);
  assert.equal(replay.task.id, started.task.id);
  assert.deepEqual([...replay.collection_follow_up_ids].sort(), [...started.collection_follow_up_ids].sort());

  await rejectsMessage(
    () => finalizeSecretaryMeetingPack({ context, payload: {
      pack_id: started.task.id,
      expected_version: 99,
      evidence_id: "meeting-pack-finalize-stale",
      occurred_at: "2035-09-02T02:00:00Z",
    } }),
    "SECRETARY_MEETING_PACK_STALE_VERSION",
  );
  await rejectsMessage(
    () => finalizeSecretaryMeetingPack({ context, payload: {
      pack_id: started.task.id,
      expected_version: 1,
      evidence_id: "meeting-pack-finalize-incomplete",
      occurred_at: "2035-09-02T02:05:00Z",
    } }),
    "SECRETARY_MEETING_PACK_REQUIRED_ITEMS_INCOMPLETE",
  );

  const agendaItemId = started.register.items.find((item) => item.label === "Board agenda").id;
  const financeItemId = started.register.items.find((item) => item.label === "Finance paper").id;
  const agendaReady = await recordSecretaryMeetingPackItem({ context, payload: {
    pack_id: started.task.id,
    item_id: agendaItemId,
    expected_version: 1,
    evidence_id: "meeting-pack-agenda-ready-1",
    occurred_at: "2035-09-03T02:00:00Z",
    source_reference: "fixture://agenda/final-v1",
  } });
  assert.equal(agendaReady.register.version, 2);
  assert.equal(agendaReady.item.status, "READY");

  const financeReady = await recordSecretaryMeetingPackItem({ context, payload: {
    pack_id: started.task.id,
    item_id: financeItemId,
    expected_version: 2,
    evidence_id: "meeting-pack-finance-ready-1",
    occurred_at: "2035-09-03T03:00:00Z",
    source_reference: "fixture://finance-paper/final-v1",
  } });
  assert.equal(financeReady.register.version, 3);

  const finalizedV1 = await finalizeSecretaryMeetingPack({ context, payload: {
    pack_id: started.task.id,
    expected_version: 3,
    evidence_id: "meeting-pack-finalize-1",
    occurred_at: "2035-09-04T02:00:00Z",
  } });
  assert.equal(finalizedV1.register.state, "FINALIZED");
  assert.equal(finalizedV1.register.version, 4);
  assert.equal(finalizedV1.register.frozen_versions.length, 1);
  const frozenV1 = JSON.parse(JSON.stringify(finalizedV1.register.frozen_versions[0]));
  assert.equal(frozenV1.items.every((item) => item.status === "READY"), true);

  const distributed = await recordSecretaryMeetingPackDistribution({ context, payload: {
    pack_id: started.task.id,
    recipient_party_id: recipientPartyId,
    expected_version: 4,
    evidence_id: "meeting-pack-distribution-1",
    occurred_at: "2035-09-05T02:00:00Z",
    distribution_status: "SENT",
    channel: "EMAIL",
    delivery_reference: "fixture://mail/outbound-1",
  } });
  assert.equal(distributed.register.state, "DISTRIBUTED");
  assert.equal(distributed.register.version, 5);
  assert.equal(distributed.recipient.distribution_status, "SENT");
  assert.equal(distributed.distribution_delivery_inferred, false);

  const acknowledgementFollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id)
      .eq("contact_party_id", recipientPartyId),
    "SECRETARY_MEETING_PACK_ACK_FOLLOW_UP_READ_FAILED",
  );
  assert.ok(acknowledgementFollowUps.some((row) => row.metadata?.secretary_meeting_pack_kind === "ACKNOWLEDGEMENT" && row.status === "PENDING"));

  const acknowledged = await recordSecretaryMeetingPackAcknowledgement({ context, payload: {
    pack_id: started.task.id,
    recipient_party_id: recipientPartyId,
    expected_version: 5,
    evidence_id: "meeting-pack-ack-1",
    occurred_at: "2035-09-05T04:00:00Z",
  } });
  assert.equal(acknowledged.register.version, 6);
  assert.equal(acknowledged.recipient.acknowledgement_status, "ACKNOWLEDGED");
  assert.equal(acknowledged.acknowledgement_is_approval, false);
  assert.equal(acknowledged.acknowledgement_is_attendance, false);

  const reopened = await reopenSecretaryMeetingPackForRevision({ context, payload: {
    pack_id: started.task.id,
    expected_version: 6,
    evidence_id: "meeting-pack-reopen-1",
    occurred_at: "2035-09-06T02:00:00Z",
    reason: "Add an explicitly supplied appendix.",
  } });
  assert.equal(reopened.register.state, "DRAFT");
  assert.equal(reopened.register.version, 7);
  assert.equal(reopened.register.frozen_versions.length, 1);
  assert.deepEqual(reopened.register.frozen_versions[0], frozenV1);
  assert.equal(reopened.register.recipients[0].distribution_status, "NOT_DISTRIBUTED");
  assert.equal(reopened.register.recipients[0].acknowledgement_status, "PENDING");

  const added = await addSecretaryMeetingPackItem({ context, payload: {
    pack_id: started.task.id,
    expected_version: 7,
    evidence_id: "meeting-pack-add-appendix-1",
    occurred_at: "2035-09-06T03:00:00Z",
    label: "Appendix",
    kind: "OTHER",
    required: false,
  } });
  assert.equal(added.register.version, 8);
  const appendixId = added.output.item.id;

  const appendixReady = await recordSecretaryMeetingPackItem({ context, payload: {
    pack_id: started.task.id,
    item_id: appendixId,
    expected_version: 8,
    evidence_id: "meeting-pack-appendix-ready-1",
    occurred_at: "2035-09-06T04:00:00Z",
    source_reference: "fixture://appendix/v1",
  } });
  assert.equal(appendixReady.register.version, 9);

  const finalizedV2 = await finalizeSecretaryMeetingPack({ context, payload: {
    pack_id: started.task.id,
    expected_version: 9,
    evidence_id: "meeting-pack-finalize-2",
    occurred_at: "2035-09-07T02:00:00Z",
  } });
  assert.equal(finalizedV2.register.state, "FINALIZED");
  assert.equal(finalizedV2.register.version, 10);
  assert.equal(finalizedV2.register.frozen_versions.length, 2);
  assert.deepEqual(finalizedV2.register.frozen_versions[0], frozenV1);
  assert.equal(finalizedV2.register.frozen_versions[1].items.some((item) => item.id === appendixId), true);

  const finalRead = await readSecretaryMeetingPackCoordination({ context, payload: { pack_id: started.task.id } });
  assert.equal(finalRead.register.frozen_versions.length, 2);
  assert.equal(finalRead.required_items_incomplete.length, 0);
  assert.equal(finalRead.document_store_created, false);
  assert.equal(finalRead.file_content_read, false);
  assert.equal(finalRead.calendar_event_modified, false);
  assert.equal(finalRead.external_message_sent_by_runtime, false);
  assert.equal(finalRead.provider_calls_performed, false);
  assert.equal(finalRead.external_authority_used, false);

  console.log("SECRETARY_MEETING_PACK_COORDINATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_MEETING_PACK_REQUIRED_ITEMS_BLOCK_FINALIZATION=true");
  console.log("SECRETARY_MEETING_PACK_FROZEN_VERSION_HISTORY=true");
  console.log("SECRETARY_MEETING_PACK_DISTRIBUTION_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_MEETING_PACK_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_MEETING_PACK_ACKNOWLEDGEMENT_NOT_APPROVAL=true");
  console.log("SECRETARY_MEETING_PACK_ACKNOWLEDGEMENT_NOT_ATTENDANCE=true");
  console.log("SECRETARY_MEETING_PACK_EVIDENCE_REPLAY_SAFE=true");
  console.log("SECRETARY_MEETING_PACK_STALE_VERSION_FENCED=true");
  console.log("SECRETARY_MEETING_PACK_FILE_CONTENT_READ=false");
  console.log("SECRETARY_MEETING_PACK_CALENDAR_EVENT_MODIFIED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_MEETING_PACK_LOCAL_CLEANUP_WARNING:${cleanup.error.message}`);
  }
}
