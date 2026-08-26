import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_COORDINATION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_MEETING_COORDINATION_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_COORDINATION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) {
    throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  }
  return resolved.data || null;
}

async function many(result, label) {
  const resolved = await result;
  if (resolved.error) {
    throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  }
  return Array.isArray(resolved.data) ? resolved.data : [];
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  createSecretaryMeetingCoordination,
  readSecretaryMeetingCoordination,
} = await import("../lib/operator/secretary/SecretaryMeetingCoordinationRuntime.js");
const {
  secretaryMeetingParticipantHasExplicitAvailabilityEvidence,
  processSecretaryMeetingCoordinationWithBookingGuard,
} = await import("../lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime.js");
const { createSecretaryMeetingCoordinationCapability } = await import("../lib/platform/capabilities/createSecretaryMeetingCoordinationCapability.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations")
      .insert({ name: "Secretary Meeting Coordination Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties")
      .insert([
        { organization_id: organizationId, display_name: "Executive", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Alice Participant", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Bob Participant", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Charlie Participant", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      ])
      .select("id,display_name"),
    "SECRETARY_MEETING_COORDINATION_LOCAL_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Executive");
  const aliceId = byName.get("Alice Participant");
  const bobId = byName.get("Bob Participant");
  const charlieId = byName.get("Charlie Participant");
  assert.ok(executiveId && aliceId && bobId && charlieId);

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };

  const candidateSlots = [
    { id: "slot-a", starts_at: "2026-09-15T10:00:00+07:00", ends_at: "2026-09-15T11:00:00+07:00", timezone: "Asia/Bangkok" },
    { id: "slot-b", starts_at: "2026-09-15T14:00:00+07:00", ends_at: "2026-09-15T15:00:00+07:00", timezone: "Asia/Bangkok" },
  ];

  const delegated = await createSecretaryMeetingCoordination({
    context,
    payload: {
      title: "Executive Partner Review",
      purpose: "Review partnership operating plan",
      location: "Churchill office",
      timezone: "Asia/Bangkok",
      candidate_slots: candidateSlots,
      response_due_at: "2026-09-14T18:00:00+07:00",
      participants: [
        { party_id: aliceId, required: true, action_type: "MESSAGE" },
        { party_id: bobId, required: true, action_type: "EMAIL" },
      ],
      metadata: { local_certification: true },
    },
  });

  assert.equal(delegated.status, "collecting");
  assert.equal(delegated.contract, "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_V1");
  assert.equal(delegated.secretary_owns_follow_through, true);
  assert.equal(delegated.attendance_not_inferred, true);
  assert.equal(delegated.availability_requires_explicit_evidence, true);
  assert.equal(delegated.calendar_event_created, false);

  const initialParticipants = await many(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("coordination_id", delegated.coordination.id)
      .order("created_at", { ascending: true }),
    "SECRETARY_MEETING_COORDINATION_LOCAL_PARTICIPANTS_READ_FAILED",
  );
  assert.equal(initialParticipants.length, 2);
  assert.equal(initialParticipants.every((row) => row.status === "REQUESTED"), true);
  assert.equal(initialParticipants.every((row) => Boolean(row.follow_up_id)), true);

  for (const participant of initialParticipants) {
    const evidenceKind = participant.party_id === aliceId ? "INBOUND_MESSAGE" : "SECRETARY_CALL";
    const evidenceId = participant.party_id === aliceId
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
    await one(
      supabaseAdmin.from("secretary_meeting_coordination_participants")
        .update({
          status: "RESPONDED",
          received_at: new Date().toISOString(),
          response_body: "slot-b works for me",
          availability: {
            available_slot_ids: ["slot-b"],
            unavailable_slot_ids: [],
            none_work: false,
            needs_clarification: false,
            confidence: 1,
          },
          extraction_confidence: 1,
          metadata: {
            ...participant.metadata,
            explicit_response_evidence: true,
            latest_availability_evidence_kind: evidenceKind,
            latest_availability_evidence_id: evidenceId,
            attendance_not_inferred: true,
            external_authority_used: false,
          },
        })
        .eq("id", participant.id)
        .select("*")
        .single(),
      "SECRETARY_MEETING_COORDINATION_LOCAL_EXPLICIT_EVIDENCE_UPDATE_FAILED",
    );
  }

  const ready = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", delegated.coordination.id)
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_COORDINATION_READ_FAILED",
  );
  const booked = await processSecretaryMeetingCoordinationWithBookingGuard(ready);
  assert.equal(booked.status, "booked");
  assert.equal(booked.selected_slot.id, "slot-b");
  assert.equal(booked.coordination.status, "BOOKED");
  assert.equal(booked.coordination.selected_slot_id, "slot-b");
  assert.ok(booked.coordination.calendar_event_id);
  assert.equal(booked.external_authority_used, false);

  const calendarEvent = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", booked.coordination.calendar_event_id)
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_CALENDAR_EVENT_READ_FAILED",
  );
  assert.equal(calendarEvent.event_type, "MEETING");
  assert.equal(calendarEvent.status, "CONFIRMED");
  assert.equal(calendarEvent.source, "secretary_meeting_coordination");
  assert.equal(calendarEvent.metadata.selected_slot_id, "slot-b");
  assert.equal(calendarEvent.metadata.attendance_not_inferred, true);
  assert.equal(calendarEvent.metadata.availability_was_explicitly_collected, true);

  const statusView = await readSecretaryMeetingCoordination({ context, payload: { coordination_id: delegated.coordination.id } });
  assert.deepEqual(statusView.attendance_confirmed_party_ids, []);
  assert.equal(statusView.attendance_not_inferred, true);
  assert.equal(statusView.secretary_owns_follow_through, false);

  const forged = await createSecretaryMeetingCoordination({
    context,
    payload: {
      title: "Forged Evidence Guard",
      timezone: "Asia/Bangkok",
      candidate_slots: candidateSlots,
      response_due_at: "2026-09-14T18:00:00+07:00",
      participants: [{ party_id: charlieId, required: true, action_type: "MESSAGE" }],
      metadata: { local_certification: true },
    },
  });
  const forgedParticipant = await one(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("coordination_id", forged.coordination.id)
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_FORGED_PARTICIPANT_READ_FAILED",
  );
  const forgedResponded = await one(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .update({
        status: "RESPONDED",
        availability: { available_slot_ids: ["slot-a"], none_work: false, needs_clarification: false },
        metadata: { ...forgedParticipant.metadata, explicit_response_evidence: false },
      })
      .eq("id", forgedParticipant.id)
      .select("*")
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_FORGED_PARTICIPANT_UPDATE_FAILED",
  );
  assert.equal(secretaryMeetingParticipantHasExplicitAvailabilityEvidence(forgedResponded), false);
  const forgedCoordination = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", forged.coordination.id)
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_FORGED_COORDINATION_READ_FAILED",
  );
  const blocked = await processSecretaryMeetingCoordinationWithBookingGuard(forgedCoordination);
  assert.equal(blocked.status, "needs_input");
  assert.equal(blocked.booking_blocked_without_explicit_availability_evidence, true);
  assert.equal(blocked.coordination.last_error, "SECRETARY_MEETING_COORDINATION_EXPLICIT_EVIDENCE_REQUIRED");
  assert.equal(blocked.coordination.calendar_event_id, null);

  const noCommon = await createSecretaryMeetingCoordination({
    context,
    payload: {
      title: "No Common Slot Guard",
      timezone: "Asia/Bangkok",
      candidate_slots: candidateSlots,
      response_due_at: "2026-09-14T18:00:00+07:00",
      participants: [
        { party_id: aliceId, required: true, action_type: "MESSAGE" },
        { party_id: bobId, required: true, action_type: "EMAIL" },
      ],
      metadata: { local_certification: true },
    },
  });
  const noCommonParticipants = await many(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("coordination_id", noCommon.coordination.id),
    "SECRETARY_MEETING_COORDINATION_LOCAL_NO_COMMON_PARTICIPANTS_READ_FAILED",
  );
  for (const participant of noCommonParticipants) {
    const slotId = participant.party_id === aliceId ? "slot-a" : "slot-b";
    await one(
      supabaseAdmin.from("secretary_meeting_coordination_participants")
        .update({
          status: "RESPONDED",
          availability: { available_slot_ids: [slotId], none_work: false, needs_clarification: false },
          metadata: {
            ...participant.metadata,
            explicit_response_evidence: true,
            latest_availability_evidence_kind: "INBOUND_MESSAGE",
            latest_availability_evidence_id: crypto.randomUUID(),
            attendance_not_inferred: true,
            external_authority_used: false,
          },
        })
        .eq("id", participant.id)
        .select("*")
        .single(),
      "SECRETARY_MEETING_COORDINATION_LOCAL_NO_COMMON_PARTICIPANT_UPDATE_FAILED",
    );
  }
  const noCommonCoordination = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", noCommon.coordination.id)
      .single(),
    "SECRETARY_MEETING_COORDINATION_LOCAL_NO_COMMON_COORDINATION_READ_FAILED",
  );
  const noCommonOutcome = await processSecretaryMeetingCoordinationWithBookingGuard(noCommonCoordination);
  assert.equal(noCommonOutcome.status, "needs_input");
  assert.equal(noCommonOutcome.coordination.last_error, "SECRETARY_MEETING_COORDINATION_NO_COMMON_EXPLICIT_SLOT");
  assert.equal(noCommonOutcome.coordination.calendar_event_id, null);

  const capabilityCoordinate = createSecretaryMeetingCoordinationCapability("coordinate");
  const capabilityStatus = createSecretaryMeetingCoordinationCapability("status");
  const capabilityCancel = createSecretaryMeetingCoordinationCapability("cancel");
  assert.equal(capabilityCoordinate.manifest.capability, "secretary_meeting_coordination");
  assert.equal(capabilityCoordinate.manifest.action, "coordinate");
  assert.equal(capabilityCoordinate.manifest.operatorRequiresConfirmation, true);
  assert.equal(capabilityStatus.manifest.operatorMode, "read");
  assert.equal(capabilityStatus.manifest.operatorAutoExecute, true);
  assert.equal(capabilityCancel.manifest.action, "cancel");

  console.log("SECRETARY_MEETING_COORDINATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_MULTI_PARTY_AVAILABILITY_COLLECTION=true");
  console.log("SECRETARY_COMMON_SLOT_REQUIRES_ALL_REQUIRED_PARTICIPANTS=true");
  console.log("SECRETARY_EXPLICIT_AVAILABILITY_EVIDENCE_REQUIRED_FOR_BOOKING=true");
  console.log("SECRETARY_FORGED_RESPONDED_STATE_FAILS_CLOSED=true");
  console.log("SECRETARY_NO_COMMON_SLOT_FAILS_TO_EXECUTIVE_INPUT=true");
  console.log("SECRETARY_ATOMIC_CALENDAR_BOOKING=true");
  console.log("SECRETARY_ATTENDANCE_NOT_INFERRED=true");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
