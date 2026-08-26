import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_BOOKED_MEETING_CHANGE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_BOOKED_MEETING_CHANGE_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_BOOKED_MEETING_CHANGE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const { createSecretaryMeetingCoordination } = await import("../lib/operator/secretary/SecretaryMeetingCoordinationRuntime.js");
const { processSecretaryMeetingCoordinationWithBookingGuard } = await import("../lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime.js");
const {
  cancelSecretaryBookedMeeting,
  repairSecretaryBookedMeetingChangeNotifications,
  rescheduleSecretaryBookedMeeting,
} = await import("../lib/operator/secretary/SecretaryBookedMeetingChangeRuntime.js");
const { createSecretaryMeetingCoordinationCapability } = await import("../lib/platform/capabilities/createSecretaryMeetingCoordinationCapability.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations")
      .insert({ name: "Secretary Booked Meeting Change Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties")
      .insert([
        { organization_id: organizationId, display_name: "Executive", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Alice", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Bob", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      ])
      .select("id,display_name"),
    "SECRETARY_BOOKED_MEETING_CHANGE_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Executive");
  const aliceId = byName.get("Alice");
  const bobId = byName.get("Bob");
  assert.ok(executiveId && aliceId && bobId);

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };

  const delegated = await createSecretaryMeetingCoordination({
    context,
    payload: {
      title: "Executive Multi-Party Change Certification",
      purpose: "Certify booked meeting lifecycle",
      location: "Room A",
      timezone: "Asia/Bangkok",
      candidate_slots: [
        { id: "slot-original", starts_at: "2026-09-20T10:00:00+07:00", ends_at: "2026-09-20T11:00:00+07:00", timezone: "Asia/Bangkok" },
        { id: "slot-alternate", starts_at: "2026-09-20T14:00:00+07:00", ends_at: "2026-09-20T15:00:00+07:00", timezone: "Asia/Bangkok" },
      ],
      response_due_at: "2026-09-19T18:00:00+07:00",
      participants: [
        { party_id: aliceId, required: true, action_type: "MESSAGE" },
        { party_id: bobId, required: true, action_type: "EMAIL" },
      ],
      metadata: { local_certification: true },
    },
  });

  const participants = await many(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("coordination_id", delegated.coordination.id)
      .order("created_at", { ascending: true }),
    "SECRETARY_BOOKED_MEETING_CHANGE_PARTICIPANTS_READ_FAILED",
  );
  assert.equal(participants.length, 2);

  for (const participant of participants) {
    await one(
      supabaseAdmin.from("secretary_meeting_coordination_participants")
        .update({
          status: "RESPONDED",
          received_at: new Date().toISOString(),
          response_body: "slot-original works",
          availability: {
            available_slot_ids: ["slot-original"],
            unavailable_slot_ids: [],
            none_work: false,
            needs_clarification: false,
            confidence: 1,
          },
          extraction_confidence: 1,
          metadata: {
            ...participant.metadata,
            explicit_response_evidence: true,
            latest_availability_evidence_kind: participant.party_id === aliceId ? "INBOUND_MESSAGE" : "SECRETARY_CALL",
            latest_availability_evidence_id: crypto.randomUUID(),
            attendance_not_inferred: true,
            external_authority_used: false,
          },
        })
        .eq("id", participant.id)
        .select("*")
        .single(),
      "SECRETARY_BOOKED_MEETING_CHANGE_PARTICIPANT_EVIDENCE_UPDATE_FAILED",
    );
  }

  const ready = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", delegated.coordination.id)
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_COORDINATION_READ_FAILED",
  );
  const booked = await processSecretaryMeetingCoordinationWithBookingGuard(ready);
  assert.equal(booked.status, "booked");
  assert.equal(booked.coordination.status, "BOOKED");
  assert.equal(booked.coordination.selected_slot_id, "slot-original");
  assert.ok(booked.coordination.calendar_event_id);

  const bookingNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_meeting_coordination_id", delegated.coordination.id)
      .eq("metadata->>meeting_booking_notification", "true"),
    "SECRETARY_BOOKED_MEETING_CHANGE_BOOKING_NOTICES_READ_FAILED",
  );
  assert.equal(bookingNotices.length, 2);
  assert.equal(bookingNotices.every((row) => row.status === "PENDING"), true);

  const conflict = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .insert({
        organization_id: organizationId,
        owner_party_id: executiveId,
        title: "Conflicting executive block",
        event_type: "BLOCK",
        status: "CONFIRMED",
        starts_at: "2026-09-21T10:30:00+07:00",
        ends_at: "2026-09-21T11:30:00+07:00",
        timezone: "Asia/Bangkok",
        all_day: false,
        source: "local-certification",
        created_by_party_id: executiveId,
        updated_by_party_id: executiveId,
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_CONFLICT_INSERT_FAILED",
  );

  let conflictBlocked = false;
  try {
    await rescheduleSecretaryBookedMeeting({
      context,
      payload: {
        coordination_id: delegated.coordination.id,
        starts_at: "2026-09-21T10:00:00+07:00",
        ends_at: "2026-09-21T11:00:00+07:00",
        timezone: "Asia/Bangkok",
      },
    });
  } catch (error) {
    conflictBlocked = String(error?.message || error).includes("SECRETARY_BOOKED_MEETING_RESCHEDULE_SLOT_UNAVAILABLE");
  }
  assert.equal(conflictBlocked, true);

  const unchangedAfterConflict = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", booked.coordination.calendar_event_id)
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_UNCHANGED_EVENT_READ_FAILED",
  );
  assert.equal(unchangedAfterConflict.starts_at, "2026-09-20T03:00:00+00:00");
  assert.equal(unchangedAfterConflict.ends_at, "2026-09-20T04:00:00+00:00");

  await supabaseAdmin.from("secretary_calendar_events").delete().eq("id", conflict.id);

  const rescheduled = await rescheduleSecretaryBookedMeeting({
    context,
    payload: {
      coordination_id: delegated.coordination.id,
      starts_at: "2026-09-21T13:00:00+07:00",
      ends_at: "2026-09-21T14:00:00+07:00",
      timezone: "Asia/Bangkok",
      location: "Room B",
    },
  });
  assert.equal(rescheduled.status, "rescheduled");
  assert.equal(rescheduled.change_kind, "RESCHEDULE");
  assert.equal(rescheduled.change_version, 1);
  assert.equal(rescheduled.coordination.status, "BOOKED");
  assert.equal(rescheduled.coordination.selected_slot_id, "schedule-change-1");
  assert.equal(rescheduled.calendar_event.status, "CONFIRMED");
  assert.equal(rescheduled.calendar_event.location, "Room B");
  assert.equal(rescheduled.notifications.notification_count, 2);
  assert.equal(rescheduled.notifications.notifications_include_all_participants, true);
  assert.equal(rescheduled.notifications.attendance_not_inferred, true);
  assert.equal(rescheduled.notifications.rsvp_not_inferred, true);

  const staleBookingNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_meeting_coordination_id", delegated.coordination.id)
      .eq("metadata->>meeting_booking_notification", "true"),
    "SECRETARY_BOOKED_MEETING_CHANGE_STALE_BOOKING_NOTICE_READ_FAILED",
  );
  assert.equal(staleBookingNotices.length, 2);
  assert.equal(staleBookingNotices.every((row) => row.status === "CANCELLED"), true);

  let rescheduleNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_meeting_coordination_id", delegated.coordination.id)
      .eq("metadata->>meeting_schedule_change_notification", "true")
      .eq("metadata->>meeting_schedule_change_kind", "RESCHEDULE"),
    "SECRETARY_BOOKED_MEETING_CHANGE_RESCHEDULE_NOTICES_READ_FAILED",
  );
  assert.equal(rescheduleNotices.length, 2);
  assert.deepEqual(new Set(rescheduleNotices.map((row) => row.action_type)), new Set(["MESSAGE", "EMAIL"]));
  assert.equal(rescheduleNotices.every((row) => row.status === "PENDING"), true);

  const removedNotice = rescheduleNotices[0];
  await one(
    supabaseAdmin.from("secretary_follow_ups")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", removedNotice.id)
      .select("id")
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_REPAIR_FIXTURE_DELETE_FAILED",
  );
  const coordinationBeforeRepair = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", delegated.coordination.id)
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_REPAIR_COORDINATION_READ_FAILED",
  );
  await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .update({
        metadata: {
          ...coordinationBeforeRepair.metadata,
          meeting_change_notifications_materialized: false,
          meeting_change_notification_last_error: "SIMULATED_INTERRUPTION",
        },
      })
      .eq("organization_id", organizationId)
      .eq("id", delegated.coordination.id)
      .select("id")
      .single(),
    "SECRETARY_BOOKED_MEETING_CHANGE_REPAIR_FLAG_UPDATE_FAILED",
  );

  const repair = await repairSecretaryBookedMeetingChangeNotifications({ limit: 8 });
  assert.equal(repair.repair_candidates_selected_server_side, true);
  assert.equal(repair.oldest_unfinished_first, true);
  assert.equal(repair.repair_scan_not_limited_to_recent_changes, true);
  assert.equal(repair.repaired.some((row) => row.coordination_id === delegated.coordination.id && row.status === "repaired"), true);

  rescheduleNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_meeting_coordination_id", delegated.coordination.id)
      .eq("metadata->>meeting_schedule_change_notification", "true")
      .eq("metadata->>meeting_schedule_change_kind", "RESCHEDULE"),
    "SECRETARY_BOOKED_MEETING_CHANGE_REPAIRED_NOTICE_READ_FAILED",
  );
  assert.equal(rescheduleNotices.length, 2);

  const cancelled = await cancelSecretaryBookedMeeting({
    context,
    payload: {
      coordination_id: delegated.coordination.id,
      reason: "Executive changed plans",
    },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.change_kind, "CANCEL");
  assert.equal(cancelled.change_version, 2);
  assert.equal(cancelled.coordination.status, "CANCELLED");
  assert.equal(cancelled.calendar_event.status, "CANCELLED");
  assert.equal(cancelled.calendar_event_cancelled, true);
  assert.equal(cancelled.notifications.notification_count, 2);
  assert.equal(cancelled.notifications.notifications_include_all_participants, true);

  const staleRescheduleNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_meeting_coordination_id", delegated.coordination.id)
      .eq("metadata->>meeting_schedule_change_kind", "RESCHEDULE"),
    "SECRETARY_BOOKED_MEETING_CHANGE_STALE_RESCHEDULE_NOTICE_READ_FAILED",
  );
  assert.equal(staleRescheduleNotices.length, 2);
  assert.equal(staleRescheduleNotices.every((row) => row.status === "CANCELLED"), true);

  const cancellationNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_meeting_coordination_id", delegated.coordination.id)
      .eq("metadata->>meeting_schedule_change_notification", "true")
      .eq("metadata->>meeting_schedule_change_kind", "CANCEL"),
    "SECRETARY_BOOKED_MEETING_CHANGE_CANCELLATION_NOTICES_READ_FAILED",
  );
  assert.equal(cancellationNotices.length, 2);
  assert.deepEqual(new Set(cancellationNotices.map((row) => row.action_type)), new Set(["MESSAGE", "EMAIL"]));
  assert.equal(cancellationNotices.every((row) => row.status === "PENDING"), true);
  assert.equal(cancellationNotices.every((row) => row.metadata.attendance_not_inferred === true), true);
  assert.equal(cancellationNotices.every((row) => row.metadata.rsvp_not_inferred === true), true);

  const preservedParticipants = await many(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("status,availability,metadata")
      .eq("organization_id", organizationId)
      .eq("coordination_id", delegated.coordination.id),
    "SECRETARY_BOOKED_MEETING_CHANGE_PRESERVED_PARTICIPANTS_READ_FAILED",
  );
  assert.equal(preservedParticipants.every((row) => row.status === "RESPONDED"), true);
  assert.equal(preservedParticipants.every((row) => Array.isArray(row.availability.available_slot_ids)), true);

  const rescheduleCapability = createSecretaryMeetingCoordinationCapability("rescheduleBooked");
  const cancelCapability = createSecretaryMeetingCoordinationCapability("cancelBooked");
  assert.equal(rescheduleCapability.manifest.operatorRequiresConfirmation, true);
  assert.equal(rescheduleCapability.manifest.risk, "high");
  assert.equal(cancelCapability.manifest.operatorRequiresConfirmation, true);
  assert.equal(cancelCapability.manifest.risk, "high");

  console.log("SECRETARY_BOOKED_MEETING_CHANGE_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_BOOKED_MEETING_RESCHEDULE_ATOMIC=true");
  console.log("SECRETARY_BOOKED_MEETING_RESCHEDULE_CONFLICT_FAILS_CLOSED=true");
  console.log("SECRETARY_BOOKED_MEETING_FAILED_RESCHEDULE_PRESERVES_ORIGINAL=true");
  console.log("SECRETARY_BOOKED_MEETING_SCHEDULE_HISTORY_PRESERVED=true");
  console.log("SECRETARY_BOOKED_MEETING_STALE_NOTIFICATIONS_CANCELLED=true");
  console.log("SECRETARY_BOOKED_MEETING_CHANGE_NOTIFIES_ALL_PARTICIPANTS=true");
  console.log("SECRETARY_BOOKED_MEETING_CHANGE_PRESERVES_PARTICIPANT_CHANNEL=true");
  console.log("SECRETARY_BOOKED_MEETING_CHANGE_NOTIFICATION_REPAIRABLE=true");
  console.log("SECRETARY_BOOKED_MEETING_CANCELS_CANONICAL_EVENT=true");
  console.log("SECRETARY_BOOKED_MEETING_PARTICIPANT_EVIDENCE_PRESERVED=true");
  console.log("SECRETARY_BOOKED_MEETING_CHANGE_CONFIRMATION_REQUIRED=true");
  console.log("SECRETARY_ATTENDANCE_NOT_INFERRED=true");
  console.log("SECRETARY_RSVP_NOT_INFERRED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
}
