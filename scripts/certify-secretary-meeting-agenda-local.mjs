import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_AGENDA_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_AGENDA_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  distributeSecretaryMeetingAgenda,
  finalizeSecretaryMeetingAgenda,
  readSecretaryMeetingAgenda,
  recordSecretaryMeetingAgendaAcknowledgement,
  recordSecretaryMeetingAgendaContribution,
  reviseSecretaryMeetingAgenda,
  startSecretaryMeetingAgenda,
} = await import("../lib/operator/secretary/SecretaryMeetingAgendaRuntime.js");
const { createSecretaryMeetingAgendaCapability } = await import("../lib/platform/capabilities/createSecretaryMeetingAgendaCapability.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Meeting Agenda Local Certification" }).select("id").single(),
    "SECRETARY_MEETING_AGENDA_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Agenda Executive", email: "agenda-executive@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Agenda Required", email: "agenda-required@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Agenda Optional", email: "agenda-optional@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_MEETING_AGENDA_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Agenda Executive");
  const requiredId = byName.get("Agenda Required");
  const optionalId = byName.get("Agenda Optional");
  assert.ok(executiveId && requiredId && optionalId);

  await one(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: requiredId, preferred_channel: "email", metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: optionalId, preferred_channel: "email", metadata: { local_certification: true } },
    ]).select("id").limit(1).single(),
    "SECRETARY_MEETING_AGENDA_PROFILE_INSERT_FAILED",
  );

  const event = await one(
    supabaseAdmin.from("secretary_calendar_events").insert({
      organization_id: organizationId,
      owner_party_id: executiveId,
      contact_party_id: requiredId,
      title: "Executive agenda certification meeting",
      event_type: "MEETING",
      status: "CONFIRMED",
      starts_at: "2030-10-10T09:00:00Z",
      ends_at: "2030-10-10T10:00:00Z",
      timezone: "Asia/Bangkok",
      source: "secretary",
      created_by_party_id: executiveId,
      updated_by_party_id: executiveId,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_MEETING_AGENDA_EVENT_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };

  const startPayload = {
    calendar_event_id: event.id,
    collection_deadline: "2030-10-09T06:00:00Z",
    chase_at: "2030-10-08T12:00:00Z",
    items: [{ title: "Opening priorities", details: "Review explicit priorities already supplied for the meeting." }],
    pre_read_references: [{ label: "Board pack", reference: "document://board-pack-v1" }],
    participants: [
      { party_id: requiredId, required: true, action_type: "EMAIL" },
      { party_id: optionalId, required: false, action_type: "EMAIL" },
    ],
  };
  const started = await startSecretaryMeetingAgenda({ context, payload: startPayload });
  assert.equal(started.contract, "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_AGENDA_V1");
  assert.equal(started.task.metadata.agenda_state, "COLLECTING");
  assert.equal(started.task.metadata.participants.length, 2);
  assert.equal(started.collection_follow_up_ids.length, 4);
  assert.equal(started.deterministic_task_id, true);
  assert.equal(started.attendance_not_inferred, true);
  assert.equal(started.rsvp_not_inferred, true);

  const replay = await startSecretaryMeetingAgenda({ context, payload: startPayload });
  assert.equal(replay.task.id, started.task.id);
  assert.deepEqual([...replay.collection_follow_up_ids].sort(), [...started.collection_follow_up_ids].sort());
  const collectionRows = await many(
    supabaseAdmin.from("secretary_follow_ups").select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id),
    "SECRETARY_MEETING_AGENDA_COLLECTION_READ_FAILED",
  );
  assert.equal(collectionRows.length, 4);
  assert.ok(collectionRows.every((row) => row.metadata?.execution_owner === "SECRETARY" && row.metadata?.execution_ready === true));

  const contribution = await recordSecretaryMeetingAgendaContribution({
    context,
    payload: {
      calendar_event_id: event.id,
      participant_party_id: requiredId,
      evidence_id: "message:agenda-required-1",
      items: [{ title: "Supplier decision context", details: "Review the supplier comparison already shared." }],
    },
  });
  assert.equal(contribution.status, "contribution_recorded");
  assert.equal(contribution.requires_revision, false);

  const requiredCollection = await many(
    supabaseAdmin.from("secretary_follow_ups").select("status,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id)
      .eq("contact_party_id", requiredId),
    "SECRETARY_MEETING_AGENDA_REQUIRED_COLLECTION_READ_FAILED",
  );
  assert.ok(requiredCollection.filter((row) => ["CONTRIBUTION_REQUEST", "CONTRIBUTION_CHASE"].includes(row.metadata?.secretary_meeting_agenda_kind)).every((row) => row.status === "CANCELLED"));

  const finalizedV1 = await finalizeSecretaryMeetingAgenda({
    context,
    payload: { calendar_event_id: event.id, allow_missing_contributions: true, change_note: "Initial agenda" },
  });
  assert.equal(finalizedV1.status, "finalized");
  assert.equal(finalizedV1.version.version, 1);
  assert.deepEqual(finalizedV1.missing_required_contribution_party_ids, []);
  assert.equal(finalizedV1.agenda_version_preserved, true);

  const distributedV1 = await distributeSecretaryMeetingAgenda({ context, payload: { calendar_event_id: event.id } });
  assert.equal(distributedV1.status, "distribution_queued");
  assert.equal(distributedV1.version, 1);
  assert.equal(distributedV1.distribution_follow_up_ids.length, 2);
  assert.equal(distributedV1.acknowledgement_follow_up_ids.length, 2);
  assert.equal(distributedV1.distribution_delivery_not_inferred, true);

  const distributionReplay = await distributeSecretaryMeetingAgenda({ context, payload: { calendar_event_id: event.id } });
  assert.deepEqual([...distributionReplay.distribution_follow_up_ids].sort(), [...distributedV1.distribution_follow_up_ids].sort());
  assert.deepEqual([...distributionReplay.acknowledgement_follow_up_ids].sort(), [...distributedV1.acknowledgement_follow_up_ids].sort());

  const acknowledged = await recordSecretaryMeetingAgendaAcknowledgement({
    context,
    payload: {
      calendar_event_id: event.id,
      participant_party_id: requiredId,
      evidence_id: "message:agenda-receipt-1",
      acknowledged: true,
    },
  });
  assert.equal(acknowledged.status, "acknowledgement_recorded");
  assert.equal(acknowledged.receipt_acknowledgement_is_not_rsvp, true);
  assert.equal(acknowledged.attendance_not_inferred, true);

  const late = await recordSecretaryMeetingAgendaContribution({
    context,
    payload: {
      calendar_event_id: event.id,
      participant_party_id: optionalId,
      evidence_id: "message:agenda-optional-late-1",
      items: [{ title: "Late optional topic", details: "Explicitly supplied after agenda distribution." }],
    },
  });
  assert.equal(late.status, "late_contribution_recorded");
  assert.equal(late.requires_revision, true);

  const beforeRevision = await readSecretaryMeetingAgenda({ context, payload: { calendar_event_id: event.id } });
  assert.equal(beforeRevision.agenda.pending_redistribution, true);
  assert.equal(beforeRevision.agenda.late_contributions.length, 1);
  assert.equal(beforeRevision.agenda.current_version, 1);

  const revised = await reviseSecretaryMeetingAgenda({
    context,
    payload: {
      calendar_event_id: event.id,
      change_note: "Add late optional topic",
      items: [
        { title: "Opening priorities" },
        { title: "Supplier decision context" },
        { title: "Late optional topic" },
      ],
      pre_read_references: [{ label: "Board pack", reference: "document://board-pack-v2" }],
    },
  });
  assert.equal(revised.status, "revision_opened");
  assert.equal(revised.revision_from_version, 1);
  assert.equal(revised.stale_pending_distribution_fenced, true);

  const finalizedV2 = await finalizeSecretaryMeetingAgenda({
    context,
    payload: { calendar_event_id: event.id, allow_missing_contributions: true, change_note: "Add late optional topic" },
  });
  assert.equal(finalizedV2.version.version, 2);
  const distributedV2 = await distributeSecretaryMeetingAgenda({ context, payload: { calendar_event_id: event.id } });
  assert.equal(distributedV2.version, 2);
  assert.notDeepEqual([...distributedV2.distribution_follow_up_ids].sort(), [...distributedV1.distribution_follow_up_ids].sort());

  const finalRead = await readSecretaryMeetingAgenda({ context, payload: { calendar_event_id: event.id } });
  assert.equal(finalRead.agenda.current_version, 2);
  assert.equal(finalRead.agenda.versions.length, 2);
  assert.equal(finalRead.agenda.versions[0].version, 1);
  assert.equal(finalRead.agenda.versions[1].version, 2);
  assert.equal(finalRead.version_history_preserved, true);
  assert.equal(finalRead.attendance_not_inferred, true);
  assert.equal(finalRead.rsvp_not_inferred, true);

  const readCapability = createSecretaryMeetingAgendaCapability("read");
  assert.equal(readCapability.manifest.operatorMode, "read");
  assert.equal(readCapability.manifest.operatorAutoExecute, true);
  assert.equal(readCapability.manifest.operatorRequiresConfirmation, false);
  const distributeCapability = createSecretaryMeetingAgendaCapability("distribute");
  assert.equal(distributeCapability.manifest.operatorMode, "write");
  assert.equal(distributeCapability.manifest.operatorAutoExecute, true);
  assert.equal(distributeCapability.manifest.operatorRequiresConfirmation, false);

  console.log("SECRETARY_MEETING_AGENDA_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_MEETING_AGENDA_DURABLE_TASK=true");
  console.log("SECRETARY_MEETING_AGENDA_COLLECTION_IDEMPOTENT=true");
  console.log("SECRETARY_MEETING_AGENDA_REQUIRED_CONTRIBUTION_EVIDENCE=true");
  console.log("SECRETARY_MEETING_AGENDA_SINGLE_CHASE_MATERIALIZED=true");
  console.log("SECRETARY_MEETING_AGENDA_VERSION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_MEETING_AGENDA_DISTRIBUTION_IDEMPOTENT=true");
  console.log("SECRETARY_MEETING_AGENDA_ACKNOWLEDGEMENT_EVIDENCE=true");
  console.log("SECRETARY_MEETING_AGENDA_ACKNOWLEDGEMENT_NOT_RSVP=true");
  console.log("SECRETARY_MEETING_AGENDA_LATE_CONTRIBUTION_REQUIRES_REVISION=true");
  console.log("SECRETARY_MEETING_AGENDA_STALE_DISTRIBUTION_FENCED=true");
  console.log("SECRETARY_MEETING_AGENDA_ATTENDANCE_NOT_INFERRED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_MEETING_AGENDA_LOCAL_CLEANUP_WARNING:${cleanup.error.message}`);
  }
}
