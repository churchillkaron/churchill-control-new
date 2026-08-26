import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_VISITOR_COORDINATION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_VISITOR_COORDINATION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  cancelSecretaryVisitorCoordination,
  readSecretaryVisitorCoordination,
  recordSecretaryVisitorAccessDecision,
  recordSecretaryVisitorArrivalEvidence,
  recordSecretaryVisitorArrivalInstructionAcknowledgement,
  recordSecretaryVisitorHostResponse,
  recordSecretaryVisitorResponse,
  refreshSecretaryVisitorCoordination,
  startSecretaryVisitorCoordination,
} = await import("../lib/operator/secretary/SecretaryVisitorCoordinationRuntime.js");
const { createSecretaryVisitorCoordinationCapability } = await import("../lib/platform/capabilities/createSecretaryVisitorCoordinationCapability.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Visitor Coordination Local Certification" }).select("id").single(),
    "SECRETARY_VISITOR_COORDINATION_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Visitor Host", email: "visitor-host@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Visitor Guest", email: "visitor-guest@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Visitor Reception", email: "visitor-reception@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Visitor Security", email: "visitor-security@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Wrong Security", email: "wrong-security@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_VISITOR_COORDINATION_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const hostId = byName.get("Visitor Host");
  const visitorId = byName.get("Visitor Guest");
  const receptionId = byName.get("Visitor Reception");
  const securityId = byName.get("Visitor Security");
  const wrongSecurityId = byName.get("Wrong Security");
  assert.ok(hostId && visitorId && receptionId && securityId && wrongSecurityId);

  const profiles = await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: visitorId, preferred_channel: "email", metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: receptionId, preferred_channel: "email", metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: securityId, preferred_channel: "email", metadata: { local_certification: true } },
    ]).select("id,party_id"),
    "SECRETARY_VISITOR_COORDINATION_PROFILES_INSERT_FAILED",
  );
  assert.equal(profiles.length, 3);

  const event = await one(
    supabaseAdmin.from("secretary_calendar_events").insert({
      organization_id: organizationId,
      owner_party_id: hostId,
      contact_party_id: visitorId,
      title: "Executive office visitor certification",
      event_type: "MEETING",
      status: "CONFIRMED",
      starts_at: "2031-10-10T09:00:00Z",
      ends_at: "2031-10-10T10:00:00Z",
      timezone: "Asia/Bangkok",
      location: "Executive Office, Floor 10",
      source: "secretary",
      created_by_party_id: hostId,
      updated_by_party_id: hostId,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_VISITOR_COORDINATION_EVENT_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: hostId },
    metadata: { partyId: hostId, localCertification: true },
  };

  const startPayload = {
    calendar_event_id: event.id,
    visitor_party_id: visitorId,
    host_party_id: hostId,
    reception_party_id: receptionId,
    security_party_id: securityId,
    access_required: true,
    badge_required: true,
    parking_required: true,
    arrival_instructions: {
      address: "100 Executive Road",
      entrance: "North lobby",
      check_in_point: "Reception desk",
      parking: "Visitor parking; security confirmation applies.",
      contact_note: "Ask for Executive Reception",
    },
  };

  const started = await startSecretaryVisitorCoordination({ context, payload: startPayload });
  assert.equal(started.contract, "AVANTIQO_EXECUTIVE_SECRETARY_VISITOR_COORDINATION_V1");
  assert.equal(started.deterministic_task_id, true);
  assert.equal(started.task.metadata.host_confirmation_status, "PENDING");
  assert.equal(started.task.metadata.visitor_confirmation_status, "PENDING");
  assert.equal(started.task.metadata.access_status, "PENDING");
  assert.equal(started.physical_access_authority_created, false);
  assert.equal(started.physical_access_granted_by_secretary, false);
  const initialKinds = started.follow_ups.map((row) => row.metadata?.secretary_visitor_coordination_kind).sort();
  assert.deepEqual(initialKinds, ["HOST_CONFIRMATION_CHASE", "HOST_CONFIRMATION_REQUEST", "VISITOR_CONFIRMATION_CHASE", "VISITOR_CONFIRMATION_REQUEST"].sort());

  const replay = await startSecretaryVisitorCoordination({ context, payload: startPayload });
  assert.equal(replay.task.id, started.task.id);
  assert.deepEqual(replay.follow_ups.map((row) => row.id).sort(), started.follow_ups.map((row) => row.id).sort());

  const hostConfirmed = await recordSecretaryVisitorHostResponse({
    context,
    payload: {
      calendar_event_id: event.id,
      visitor_party_id: visitorId,
      party_id: hostId,
      evidence_id: "message:visitor-host-confirm-1",
      confirmed: true,
    },
  });
  assert.equal(hostConfirmed.status, "confirmed");
  assert.equal(hostConfirmed.task.metadata.host_confirmation_status, "CONFIRMED");
  assert.equal(hostConfirmed.task.metadata.visitor_confirmation_status, "PENDING");
  assert.equal(hostConfirmed.task.metadata.access_status, "PENDING");

  const visitorConfirmed = await recordSecretaryVisitorResponse({
    context,
    payload: {
      calendar_event_id: event.id,
      visitor_party_id: visitorId,
      party_id: visitorId,
      evidence_id: "message:visitor-confirm-1",
      confirmed: true,
    },
  });
  assert.equal(visitorConfirmed.status, "confirmed");
  assert.equal(visitorConfirmed.task.metadata.access_status, "REQUESTED");
  assert.equal(visitorConfirmed.task.metadata.coordination_state, "WAITING_ACCESS");
  assert.equal(visitorConfirmed.physical_access_granted_by_secretary, false);

  const afterConfirmFollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("id,status,contact_party_id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id),
    "SECRETARY_VISITOR_COORDINATION_AFTER_CONFIRM_READ_FAILED",
  );
  const accessV1 = afterConfirmFollowUps.filter((row) => ["ACCESS_REQUEST", "ACCESS_CHASE"].includes(row.metadata?.secretary_visitor_coordination_kind));
  assert.equal(accessV1.length, 2);
  assert.ok(accessV1.every((row) => row.contact_party_id === securityId && row.status === "PENDING"));
  assert.equal(afterConfirmFollowUps.filter((row) => ["ARRIVAL_INSTRUCTIONS", "RECEPTION_NOTICE"].includes(row.metadata?.secretary_visitor_coordination_kind)).length, 0);

  await assert.rejects(
    recordSecretaryVisitorAccessDecision({
      context,
      payload: {
        calendar_event_id: event.id,
        visitor_party_id: visitorId,
        decision: "APPROVED",
        decision_by_party_id: wrongSecurityId,
        evidence_id: "security:wrong-authority-1",
      },
    }),
    /SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_AUTHORITY_MISMATCH/,
  );

  const accessApproved = await recordSecretaryVisitorAccessDecision({
    context,
    payload: {
      calendar_event_id: event.id,
      visitor_party_id: visitorId,
      decision: "APPROVED",
      decision_by_party_id: securityId,
      evidence_id: "security:visitor-access-approved-v1",
    },
  });
  assert.equal(accessApproved.status, "access_approval_recorded");
  assert.equal(accessApproved.task.metadata.access_status, "APPROVED");
  assert.equal(accessApproved.task.metadata.coordination_state, "READY");
  assert.equal(accessApproved.decision_recorded_from_external_authority, true);
  assert.equal(accessApproved.physical_access_authority_created, false);
  assert.equal(accessApproved.physical_access_granted_by_secretary, false);

  const accessReplay = await recordSecretaryVisitorAccessDecision({
    context,
    payload: {
      calendar_event_id: event.id,
      visitor_party_id: visitorId,
      decision: "APPROVED",
      decision_by_party_id: securityId,
      evidence_id: "security:visitor-access-approved-v1",
    },
  });
  assert.equal(accessReplay.status, "access_decision_already_recorded");
  assert.equal(accessReplay.idempotent, true);

  const readyV1 = await readSecretaryVisitorCoordination({ context, payload: { calendar_event_id: event.id, visitor_party_id: visitorId } });
  assert.equal(readyV1.access.status, "APPROVED");
  assert.equal(readyV1.access.physical_access_granted_by_secretary, false);
  const arrivalV1 = readyV1.follow_ups.filter((row) => row.metadata?.secretary_visitor_coordination_kind === "ARRIVAL_INSTRUCTIONS");
  const receptionV1 = readyV1.follow_ups.filter((row) => row.metadata?.secretary_visitor_coordination_kind === "RECEPTION_NOTICE");
  assert.equal(arrivalV1.length, 1);
  assert.equal(receptionV1.length, 1);
  assert.equal(arrivalV1[0].contact_party_id, visitorId);
  assert.equal(receptionV1[0].contact_party_id, receptionId);

  const updatedEvent = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .update({
        starts_at: "2031-10-10T11:00:00Z",
        ends_at: "2031-10-10T12:00:00Z",
        location: "Executive Office, Floor 12",
        updated_by_party_id: hostId,
      })
      .eq("organization_id", organizationId)
      .eq("id", event.id)
      .select("*")
      .single(),
    "SECRETARY_VISITOR_COORDINATION_EVENT_RESCHEDULE_FAILED",
  );
  assert.equal(Date.parse(updatedEvent.starts_at), Date.parse("2031-10-10T11:00:00Z"));

  const refreshed = await refreshSecretaryVisitorCoordination({ context, payload: { calendar_event_id: event.id, visitor_party_id: visitorId } });
  assert.equal(refreshed.status, "schedule_change_recoordinated");
  assert.equal(refreshed.schedule_changed, true);
  assert.equal(refreshed.stale_pending_follow_ups_fenced, true);
  assert.equal(refreshed.confirmations_reset, true);
  assert.equal(refreshed.access_reapproval_required, true);
  assert.equal(refreshed.task.metadata.instruction_version, 2);
  assert.equal(refreshed.task.metadata.host_confirmation_status, "PENDING");
  assert.equal(refreshed.task.metadata.visitor_confirmation_status, "PENDING");
  assert.equal(refreshed.task.metadata.access_status, "PENDING");
  assert.equal(refreshed.task.metadata.schedule_history.length, 1);

  const afterRefresh = await many(
    supabaseAdmin.from("secretary_follow_ups").select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id),
    "SECRETARY_VISITOR_COORDINATION_REFRESH_FOLLOW_UP_READ_FAILED",
  );
  const oldPendingKinds = new Set(["ACCESS_REQUEST", "ACCESS_CHASE", "RECEPTION_NOTICE", "ARRIVAL_INSTRUCTIONS", "ARRIVAL_RECEIPT_CHASE"]);
  const oldVersionRows = afterRefresh.filter((row) => Number(row.metadata?.secretary_visitor_coordination_version) === 1 && oldPendingKinds.has(row.metadata?.secretary_visitor_coordination_kind));
  assert.ok(oldVersionRows.length >= 4);
  assert.ok(oldVersionRows.every((row) => row.status === "CANCELLED"));
  const freshConfirmationRows = afterRefresh.filter((row) => Number(row.metadata?.secretary_visitor_coordination_version) === 2 && ["HOST_CONFIRMATION_REQUEST", "HOST_CONFIRMATION_CHASE", "VISITOR_CONFIRMATION_REQUEST", "VISITOR_CONFIRMATION_CHASE"].includes(row.metadata?.secretary_visitor_coordination_kind));
  assert.equal(freshConfirmationRows.length, 4);
  assert.ok(freshConfirmationRows.every((row) => row.status === "PENDING"));

  await recordSecretaryVisitorHostResponse({
    context,
    payload: { calendar_event_id: event.id, visitor_party_id: visitorId, party_id: hostId, evidence_id: "message:visitor-host-confirm-v2", confirmed: true },
  });
  const visitorV2 = await recordSecretaryVisitorResponse({
    context,
    payload: { calendar_event_id: event.id, visitor_party_id: visitorId, party_id: visitorId, evidence_id: "message:visitor-confirm-v2", confirmed: true },
  });
  assert.equal(visitorV2.task.metadata.access_status, "REQUESTED");

  const accessV2 = await recordSecretaryVisitorAccessDecision({
    context,
    payload: { calendar_event_id: event.id, visitor_party_id: visitorId, decision: "APPROVED", decision_by_party_id: securityId, evidence_id: "security:visitor-access-approved-v2" },
  });
  assert.equal(accessV2.task.metadata.instruction_version, 2);
  assert.equal(accessV2.task.metadata.coordination_state, "READY");

  const acknowledged = await recordSecretaryVisitorArrivalInstructionAcknowledgement({
    context,
    payload: { calendar_event_id: event.id, visitor_party_id: visitorId, evidence_id: "message:arrival-instructions-received-v2", acknowledged: true },
  });
  assert.equal(acknowledged.status, "acknowledgement_recorded");
  assert.equal(acknowledged.acknowledgement_is_not_arrival, true);
  assert.equal(acknowledged.acknowledgement_is_not_access_grant, true);
  assert.equal(acknowledged.arrival_not_inferred, true);

  const arrived = await recordSecretaryVisitorArrivalEvidence({
    context,
    payload: { calendar_event_id: event.id, visitor_party_id: visitorId, state: "ARRIVED_AT_RECEPTION", recorded_by_party_id: receptionId, evidence_id: "reception:visitor-arrived-1" },
  });
  assert.equal(arrived.status, "arrival_evidence_recorded");
  assert.equal(arrived.arrival_state, "ARRIVED_AT_RECEPTION");
  assert.equal(arrived.admission_not_inferred, true);
  assert.equal(arrived.physical_access_granted_by_secretary, false);

  const departed = await recordSecretaryVisitorArrivalEvidence({
    context,
    payload: { calendar_event_id: event.id, visitor_party_id: visitorId, state: "DEPARTED", recorded_by_party_id: receptionId, evidence_id: "reception:visitor-departed-1" },
  });
  assert.equal(departed.task.metadata.coordination_state, "COMPLETED");
  assert.equal(departed.task.status, "DONE");

  const finalRead = await readSecretaryVisitorCoordination({ context, payload: { calendar_event_id: event.id, visitor_party_id: visitorId } });
  assert.equal(finalRead.visitor.arrival_status, "DEPARTED");
  assert.equal(finalRead.schedule_history.length, 1);
  assert.equal(finalRead.instruction_version, 2);
  assert.equal(finalRead.arrival_not_inferred, true);
  assert.equal(finalRead.physical_access_authority_created, false);
  assert.equal(finalRead.physical_access_granted_by_secretary, false);

  const deniedEvent = await one(
    supabaseAdmin.from("secretary_calendar_events").insert({
      organization_id: organizationId,
      owner_party_id: hostId,
      contact_party_id: visitorId,
      title: "Visitor access denial certification",
      event_type: "MEETING",
      status: "CONFIRMED",
      starts_at: "2031-11-10T09:00:00Z",
      ends_at: "2031-11-10T10:00:00Z",
      timezone: "Asia/Bangkok",
      location: "Restricted Office",
      source: "secretary",
      created_by_party_id: hostId,
      updated_by_party_id: hostId,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_VISITOR_COORDINATION_DENIAL_EVENT_INSERT_FAILED",
  );
  const deniedStarted = await startSecretaryVisitorCoordination({
    context,
    payload: {
      calendar_event_id: deniedEvent.id,
      visitor_party_id: visitorId,
      host_party_id: hostId,
      reception_party_id: receptionId,
      security_party_id: securityId,
      access_required: true,
      host_confirmed: true,
      host_confirmation_evidence_id: "host:denial-scenario-confirmed",
      visitor_confirmed: true,
      visitor_confirmation_evidence_id: "visitor:denial-scenario-confirmed",
    },
  });
  assert.equal(deniedStarted.task.metadata.access_status, "REQUESTED");
  const denied = await recordSecretaryVisitorAccessDecision({
    context,
    payload: { calendar_event_id: deniedEvent.id, visitor_party_id: visitorId, decision: "DENIED", decision_by_party_id: securityId, evidence_id: "security:visitor-access-denied" },
  });
  assert.equal(denied.status, "access_denial_recorded");
  assert.equal(denied.task.metadata.coordination_state, "BLOCKED_ACCESS");
  const deniedRead = await readSecretaryVisitorCoordination({ context, payload: { calendar_event_id: deniedEvent.id, visitor_party_id: visitorId } });
  assert.equal(deniedRead.follow_ups.filter((row) => ["ARRIVAL_INSTRUCTIONS", "RECEPTION_NOTICE"].includes(row.metadata?.secretary_visitor_coordination_kind)).length, 0);
  assert.equal(deniedRead.physical_access_granted_by_secretary, false);

  const cancelled = await cancelSecretaryVisitorCoordination({
    context,
    payload: { calendar_event_id: deniedEvent.id, visitor_party_id: visitorId, reason: "Local certification cancellation after denied access." },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.calendar_event_cancelled, false);
  const underlyingDeniedEvent = await one(
    supabaseAdmin.from("secretary_calendar_events").select("status").eq("organization_id", organizationId).eq("id", deniedEvent.id).single(),
    "SECRETARY_VISITOR_COORDINATION_DENIAL_EVENT_READ_FAILED",
  );
  assert.equal(underlyingDeniedEvent.status, "CONFIRMED");

  const readCapability = createSecretaryVisitorCoordinationCapability("read");
  assert.equal(readCapability.manifest.operatorMode, "read");
  assert.equal(readCapability.manifest.operatorAutoExecute, true);
  assert.equal(readCapability.manifest.operatorRequiresConfirmation, false);
  const accessCapability = createSecretaryVisitorCoordinationCapability("recordAccessDecision");
  assert.equal(accessCapability.manifest.operatorMode, "write");
  assert.equal(accessCapability.manifest.operatorAutoExecute, true);
  assert.equal(accessCapability.manifest.operatorRequiresConfirmation, false);
  assert.equal(accessCapability.manifest.risk, "medium");

  console.log("SECRETARY_VISITOR_COORDINATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_VISITOR_COORDINATION_DURABLE_TASK=true");
  console.log("SECRETARY_VISITOR_COORDINATION_IDEMPOTENT=true");
  console.log("SECRETARY_VISITOR_HOST_CONFIRMATION_EVIDENCE=true");
  console.log("SECRETARY_VISITOR_CONFIRMATION_EVIDENCE=true");
  console.log("SECRETARY_VISITOR_ACCESS_AUTHORITY_MATCH_REQUIRED=true");
  console.log("SECRETARY_VISITOR_ACCESS_DECISION_EVIDENCE=true");
  console.log("SECRETARY_VISITOR_ACCESS_REQUEST_NOT_GRANT=true");
  console.log("SECRETARY_VISITOR_SCHEDULE_CHANGE_RECONFIRMATION=true");
  console.log("SECRETARY_VISITOR_STALE_NOTICE_FENCED=true");
  console.log("SECRETARY_VISITOR_ACCESS_REAPPROVAL_ON_SCHEDULE_CHANGE=true");
  console.log("SECRETARY_VISITOR_RECEPTION_AND_ARRIVAL_INSTRUCTIONS=true");
  console.log("SECRETARY_VISITOR_ACKNOWLEDGEMENT_NOT_ARRIVAL=true");
  console.log("SECRETARY_VISITOR_ARRIVAL_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_VISITOR_ACCESS_DENIAL_BLOCKS_DISTRIBUTION=true");
  console.log("SECRETARY_VISITOR_COORDINATION_CANCEL_DOES_NOT_CANCEL_EVENT=true");
  console.log("SECRETARY_VISITOR_ARRIVAL_NOT_INFERRED=true");
  console.log("SECRETARY_VISITOR_PHYSICAL_ACCESS_AUTHORITY_CREATED=false");
  console.log("SECRETARY_VISITOR_PHYSICAL_ACCESS_GRANTED_BY_SECRETARY=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_VISITOR_COORDINATION_LOCAL_CLEANUP_WARNING:${cleanup.error.message}`);
  }
}
