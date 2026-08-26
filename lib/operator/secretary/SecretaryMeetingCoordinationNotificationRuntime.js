import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function deterministicFollowUpId(coordination, participant) {
  const seed = [
    "avantiqo-secretary-meeting-booking-notification-v1",
    coordination.organization_id,
    coordination.id,
    participant.id,
  ].join(":");
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function selectedSlot(coordination) {
  const selectedId = text(coordination.selected_slot_id, 120);
  return list(coordination.candidate_slots).find((slot) => text(slot?.id, 120) === selectedId) || null;
}

function participantAcceptedSelectedSlot(participant, slot) {
  if (!slot || text(participant.status, 40).toUpperCase() !== "RESPONDED") return false;
  return list(object(participant.availability).available_slot_ids)
    .map((value) => text(value, 120))
    .includes(text(slot.id, 120));
}

function bookingNotificationInstruction(coordination, participant, slot) {
  const timezone = text(slot?.timezone || coordination.timezone, 120) || "the meeting timezone";
  const parts = [
    `Notify the participant that the meeting \"${text(coordination.title, 500)}\" is now scheduled.`,
    slot ? `Scheduled time: ${text(slot.starts_at, 160)} to ${text(slot.ends_at, 160)} (${timezone}).` : null,
    coordination.location ? `Location: ${text(coordination.location, 1000)}.` : null,
    participantAcceptedSelectedSlot(participant, slot)
      ? "They previously stated that this candidate slot was available. You may acknowledge that availability evidence, but do not state or imply that their RSVP or attendance is confirmed."
      : "This is a scheduling update or invitation only. Do not state or imply that they accepted the meeting, RSVP'd, or that attendance is confirmed.",
    "Ask them to reply if their availability has changed or the scheduled time no longer works.",
  ];
  return parts.filter(Boolean).join(" ");
}

async function participantRows(coordination) {
  return many(
    supabaseAdmin
      .from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", coordination.organization_id)
      .eq("coordination_id", coordination.id)
      .order("created_at", { ascending: true }),
  );
}

async function existingFollowUp(coordination, followUpId) {
  return one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", coordination.organization_id)
      .eq("id", followUpId)
      .maybeSingle(),
  );
}

async function ensureParticipantNotification(coordination, participant, slot) {
  const followUpId = deterministicFollowUpId(coordination, participant);
  const instruction = bookingNotificationInstruction(coordination, participant, slot);
  let followUp = await existingFollowUp(coordination, followUpId);

  if (!followUp) {
    const inserted = await supabaseAdmin
      .from("secretary_follow_ups")
      .insert({
        id: followUpId,
        organization_id: coordination.organization_id,
        entity_id: coordination.entity_id || null,
        owner_party_id: coordination.requested_by_party_id || coordination.owner_party_id || null,
        contact_party_id: participant.party_id,
        calendar_event_id: coordination.calendar_event_id,
        action_type: participant.action_type,
        reason: instruction,
        status: "PENDING",
        due_at: new Date().toISOString(),
        created_by_party_id: coordination.requested_by_party_id || coordination.owner_party_id || null,
        metadata: {
          execution_owner: "SECRETARY",
          execution_ready: true,
          execution_instruction: instruction,
          secretary_meeting_coordination_id: coordination.id,
          secretary_meeting_coordination_participant_id: participant.id,
          meeting_booking_notification: true,
          meeting_booking_notification_kind: "SCHEDULED_TIME",
          selected_slot_id: slot?.id || coordination.selected_slot_id || null,
          participant_had_explicit_selected_slot_availability: participantAcceptedSelectedSlot(participant, slot),
          attendance_not_inferred: true,
          rsvp_not_inferred: true,
          external_authority_used: false,
        },
      })
      .select("*")
      .single();

    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      followUp = await existingFollowUp(coordination, followUpId);
      if (!followUp) throw inserted.error;
    } else {
      followUp = inserted.data;
    }
  }

  const metadata = object(participant.metadata);
  if (text(metadata.meeting_booking_notification_follow_up_id, 120) !== followUpId) {
    await one(
      supabaseAdmin
        .from("secretary_meeting_coordination_participants")
        .update({
          metadata: {
            ...metadata,
            meeting_booking_notification_follow_up_id: followUpId,
            meeting_booking_notification_created_at: followUp.created_at || new Date().toISOString(),
            meeting_booking_notification_selected_slot_id: slot?.id || coordination.selected_slot_id || null,
            meeting_booking_notification_delivery_owned_by_secretary: true,
            meeting_booking_notification_attendance_not_inferred: true,
            meeting_booking_notification_rsvp_not_inferred: true,
            external_authority_used: false,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", coordination.organization_id)
        .eq("id", participant.id)
        .select("*")
        .single(),
    );
  }

  return followUp;
}

export async function ensureSecretaryMeetingBookingNotifications(coordination) {
  if (!coordination?.id) throw new Error("SECRETARY_MEETING_BOOKING_NOTIFICATION_COORDINATION_REQUIRED");
  if (text(coordination.status, 40).toUpperCase() !== "BOOKED") {
    return {
      status: "not_booked",
      coordination_id: coordination.id,
      notification_count: 0,
      follow_up_ids: [],
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  }
  if (!coordination.calendar_event_id || !coordination.selected_slot_id) {
    throw new Error("SECRETARY_MEETING_BOOKING_NOTIFICATION_BOOKING_EVIDENCE_REQUIRED");
  }

  const slot = selectedSlot(coordination);
  if (!slot) throw new Error("SECRETARY_MEETING_BOOKING_NOTIFICATION_SELECTED_SLOT_NOT_FOUND");
  const participants = await participantRows(coordination);
  const followUps = [];
  for (const participant of participants) {
    followUps.push(await ensureParticipantNotification(coordination, participant, slot));
  }

  const updatedMetadata = {
    ...object(coordination.metadata),
    booking_notifications_materialized: true,
    booking_notifications_materialized_at: new Date().toISOString(),
    booking_notification_count: followUps.length,
    booking_notification_follow_up_ids: followUps.map((row) => row.id),
    booking_notifications_include_all_participants: true,
    booking_notifications_attendance_not_inferred: true,
    booking_notifications_rsvp_not_inferred: true,
    booking_notification_last_error: null,
    external_authority_used: false,
  };

  await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
      .eq("organization_id", coordination.organization_id)
      .eq("id", coordination.id)
      .eq("status", "BOOKED")
      .select("*")
      .single(),
  );

  return {
    status: "materialized",
    coordination_id: coordination.id,
    notification_count: followUps.length,
    follow_up_ids: followUps.map((row) => row.id),
    notifications_include_all_participants: true,
    deterministic_follow_up_ids: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function repairSecretaryMeetingBookingNotifications({ limit = 8 } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 8, 25));
  const rows = await many(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("*")
      .eq("status", "BOOKED")
      .or("metadata->>booking_notifications_materialized.is.null,metadata->>booking_notifications_materialized.eq.false")
      .order("completed_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(boundedLimit),
  );

  const repaired = [];
  for (const coordination of rows) {
    try {
      repaired.push(await ensureSecretaryMeetingBookingNotifications(coordination));
    } catch (error) {
      const message = text(error?.message || error, 2000);
      await supabaseAdmin
        .from("secretary_meeting_coordinations")
        .update({
          metadata: {
            ...object(coordination.metadata),
            booking_notifications_materialized: false,
            booking_notification_last_error: message,
            booking_notifications_attendance_not_inferred: true,
            booking_notifications_rsvp_not_inferred: true,
            external_authority_used: false,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", coordination.organization_id)
        .eq("id", coordination.id)
        .eq("status", "BOOKED");
      repaired.push({
        status: "pending_repair",
        coordination_id: coordination.id,
        error: message,
        attendance_not_inferred: true,
        rsvp_not_inferred: true,
        external_authority_used: false,
      });
    }
  }

  return {
    status: "completed",
    inspected: rows.length,
    repair_candidates: rows.length,
    repaired,
    repair_candidates_selected_server_side: true,
    oldest_unfinished_first: true,
    repair_scan_not_limited_to_recent_bookings: true,
    deterministic_follow_up_ids: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export default Object.freeze({
  ensure: ensureSecretaryMeetingBookingNotifications,
  repair: repairSecretaryMeetingBookingNotifications,
});
