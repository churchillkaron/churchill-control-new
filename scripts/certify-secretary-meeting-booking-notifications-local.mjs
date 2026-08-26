import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  ensureSecretaryMeetingBookingNotifications,
  repairSecretaryMeetingBookingNotifications,
} = await import("../lib/operator/secretary/SecretaryMeetingCoordinationNotificationRuntime.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations")
      .insert({ name: "Secretary Booking Notification Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties")
      .insert([
        { organization_id: organizationId, display_name: "Executive", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Required Participant", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Optional Participant", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      ])
      .select("id,display_name"),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Executive");
  const requiredId = byName.get("Required Participant");
  const optionalId = byName.get("Optional Participant");
  assert.ok(executiveId && requiredId && optionalId);

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };
  const slots = [
    { id: "slot-booked", starts_at: "2026-10-20T10:00:00+07:00", ends_at: "2026-10-20T11:00:00+07:00", timezone: "Asia/Bangkok" },
  ];

  const delegated = await createSecretaryMeetingCoordination({
    context,
    payload: {
      title: "Booking Notification Certification",
      purpose: "Certify human Secretary booking follow-through",
      location: "Executive office",
      timezone: "Asia/Bangkok",
      candidate_slots: slots,
      response_due_at: "2026-10-19T18:00:00+07:00",
      participants: [
        { party_id: requiredId, required: true, action_type: "MESSAGE" },
        { party_id: optionalId, required: false, action_type: "EMAIL" },
      ],
      metadata: { local_certification: true },
    },
  });

  const participantRows = await many(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("coordination_id", delegated.coordination.id),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_PARTICIPANTS_READ_FAILED",
  );
  assert.equal(participantRows.length, 2);

  const requiredParticipant = participantRows.find((row) => row.party_id === requiredId);
  const optionalParticipant = participantRows.find((row) => row.party_id === optionalId);
  assert.ok(requiredParticipant && optionalParticipant);

  await one(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .update({
        status: "RESPONDED",
        received_at: new Date().toISOString(),
        response_body: "slot-booked works",
        availability: {
          available_slot_ids: ["slot-booked"],
          unavailable_slot_ids: [],
          none_work: false,
          needs_clarification: false,
          confidence: 1,
        },
        extraction_confidence: 1,
        metadata: {
          ...requiredParticipant.metadata,
          explicit_response_evidence: true,
          latest_availability_evidence_kind: "INBOUND_MESSAGE",
          latest_availability_evidence_id: crypto.randomUUID(),
          attendance_not_inferred: true,
          external_authority_used: false,
        },
      })
      .eq("id", requiredParticipant.id)
      .select("*")
      .single(),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_REQUIRED_EVIDENCE_UPDATE_FAILED",
  );

  const coordination = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", delegated.coordination.id)
      .single(),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_COORDINATION_READ_FAILED",
  );
  const booked = await processSecretaryMeetingCoordinationWithBookingGuard(coordination);
  assert.equal(booked.status, "booked");
  assert.equal(booked.booking_notifications_materialized, true);
  assert.equal(booked.booking_notification_count, 2);
  assert.equal(booked.notification_state.notifications_include_all_participants, true);
  assert.equal(booked.notification_state.deterministic_follow_up_ids, true);
  assert.equal(booked.notification_state.attendance_not_inferred, true);
  assert.equal(booked.notification_state.rsvp_not_inferred, true);

  const firstNotifications = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("calendar_event_id", booked.coordination.calendar_event_id),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_FOLLOW_UP_READ_FAILED",
  );
  assert.equal(firstNotifications.length, 2);
  assert.equal(new Set(firstNotifications.map((row) => row.contact_party_id)).size, 2);
  assert.deepEqual(new Set(firstNotifications.map((row) => row.action_type)), new Set(["MESSAGE", "EMAIL"]));
  assert.equal(firstNotifications.every((row) => row.status === "PENDING"), true);
  assert.equal(firstNotifications.every((row) => row.metadata?.execution_owner === "SECRETARY"), true);
  assert.equal(firstNotifications.every((row) => row.metadata?.execution_ready === true), true);
  assert.equal(firstNotifications.every((row) => row.metadata?.meeting_booking_notification === true), true);
  assert.equal(firstNotifications.every((row) => row.metadata?.attendance_not_inferred === true), true);
  assert.equal(firstNotifications.every((row) => row.metadata?.rsvp_not_inferred === true), true);
  assert.equal(firstNotifications.every((row) => /do not state or imply/i.test(row.reason)), true);
  assert.equal(firstNotifications.every((row) => /reply if their availability has changed/i.test(row.reason)), true);

  const firstIds = [...firstNotifications.map((row) => row.id)].sort();
  const ensuredAgain = await ensureSecretaryMeetingBookingNotifications(booked.coordination);
  assert.equal(ensuredAgain.notification_count, 2);
  assert.deepEqual([...ensuredAgain.follow_up_ids].sort(), firstIds);

  const secondNotifications = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("calendar_event_id", booked.coordination.calendar_event_id),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_IDEMPOTENCY_READ_FAILED",
  );
  assert.equal(secondNotifications.length, 2);
  assert.deepEqual([...secondNotifications.map((row) => row.id)].sort(), firstIds);

  const bookedFresh = await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", booked.coordination.id)
      .single(),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_BOOKED_FRESH_READ_FAILED",
  );
  await one(
    supabaseAdmin.from("secretary_meeting_coordinations")
      .update({
        metadata: {
          ...bookedFresh.metadata,
          booking_notifications_materialized: false,
          booking_notification_last_error: "SIMULATED_INTERRUPTION",
        },
      })
      .eq("organization_id", organizationId)
      .eq("id", booked.coordination.id)
      .select("*")
      .single(),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_REPAIR_FIXTURE_UPDATE_FAILED",
  );

  const repaired = await repairSecretaryMeetingBookingNotifications({ limit: 8 });
  const repairedEntry = repaired.repaired.find((row) => row.coordination_id === booked.coordination.id);
  assert.ok(repairedEntry);
  assert.equal(repairedEntry.status, "materialized");
  assert.equal(repairedEntry.notification_count, 2);
  assert.deepEqual([...repairedEntry.follow_up_ids].sort(), firstIds);

  const afterRepair = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("calendar_event_id", booked.coordination.calendar_event_id),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_REPAIR_IDEMPOTENCY_READ_FAILED",
  );
  assert.equal(afterRepair.length, 2);
  assert.deepEqual([...afterRepair.map((row) => row.id)].sort(), firstIds);

  const participantAfter = await many(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("party_id,metadata")
      .eq("organization_id", organizationId)
      .eq("coordination_id", booked.coordination.id),
    "SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_PARTICIPANT_METADATA_READ_FAILED",
  );
  assert.equal(participantAfter.every((row) => Boolean(row.metadata?.meeting_booking_notification_follow_up_id)), true);
  assert.equal(participantAfter.every((row) => row.metadata?.meeting_booking_notification_attendance_not_inferred === true), true);
  assert.equal(participantAfter.every((row) => row.metadata?.meeting_booking_notification_rsvp_not_inferred === true), true);

  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_ALL_PARTICIPANTS=true");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_PRESERVES_CHANNEL=true");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_DETERMINISTIC_IDS=true");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_IDEMPOTENT=true");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_REPAIRABLE=true");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_ATTENDANCE_NOT_INFERRED=true");
  console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_RSVP_NOT_INFERRED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
