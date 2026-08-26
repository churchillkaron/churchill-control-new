import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function organizationId(context = {}) {
  const value = text(context.organizationId, 120);
  if (!value) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return value;
}

function actorPartyId(context = {}) {
  const value = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!value) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return value;
}

function iso(value, field) {
  const raw = text(value, 160);
  if (!raw || !Number.isFinite(Date.parse(raw))) throw new Error(`SECRETARY_BOOKED_MEETING_${field.toUpperCase()}_INVALID`);
  return new Date(raw).toISOString();
}

function deterministicChangeNotificationId({ coordinationId, participantId, version, kind }) {
  const seed = [
    "avantiqo-secretary-booked-meeting-change-notification-v1",
    coordinationId,
    participantId,
    version,
    kind,
  ].join(":");
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function notificationInstruction({ coordination, kind, change }) {
  if (kind === "RESCHEDULE") {
    const current = object(change.current_schedule);
    return [
      `Notify the participant that the meeting \"${text(coordination.title, 500)}\" has been rescheduled by the executive/meeting owner.`,
      `New scheduled time: ${text(current.starts_at, 160)} to ${text(current.ends_at, 160)} (${text(current.timezone || coordination.timezone, 120)}).`,
      current.location ? `Location: ${text(current.location, 1000)}.` : null,
      "This replaces the previous scheduled time. Do not state or imply that the participant accepted the new time, RSVP'd, or that attendance is confirmed.",
      "Ask them to reply if the new time does not work.",
    ].filter(Boolean).join(" ");
  }
  return [
    `Notify the participant that the meeting \"${text(coordination.title, 500)}\" has been cancelled by the executive/meeting owner.`,
    change.cancellation_reason ? `Reason: ${text(change.cancellation_reason, 1000)}.` : null,
    "Do not state or imply anything about RSVP or attendance. This message only communicates the cancellation.",
  ].filter(Boolean).join(" ");
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

async function ensureChangeNotifications(change) {
  const coordination = object(change.coordination);
  const kind = text(change.change_kind, 40).toUpperCase();
  const version = Number(change.change_version);
  if (!coordination.id || !["RESCHEDULE", "CANCEL"].includes(kind) || !Number.isFinite(version)) {
    throw new Error("SECRETARY_BOOKED_MEETING_CHANGE_EVIDENCE_INVALID");
  }

  const participants = await participantRows(coordination);
  const ids = [];
  for (const participant of participants) {
    const id = deterministicChangeNotificationId({
      coordinationId: coordination.id,
      participantId: participant.id,
      version,
      kind,
    });
    const instruction = notificationInstruction({ coordination, kind, change });
    const existing = await one(
      supabaseAdmin
        .from("secretary_follow_ups")
        .select("*")
        .eq("organization_id", coordination.organization_id)
        .eq("id", id)
        .maybeSingle(),
    );
    if (!existing) {
      const inserted = await supabaseAdmin
        .from("secretary_follow_ups")
        .insert({
          id,
          organization_id: coordination.organization_id,
          entity_id: coordination.entity_id || null,
          owner_party_id: coordination.requested_by_party_id || coordination.owner_party_id,
          contact_party_id: participant.party_id,
          calendar_event_id: coordination.calendar_event_id,
          action_type: participant.action_type,
          reason: instruction,
          status: "PENDING",
          due_at: new Date().toISOString(),
          created_by_party_id: coordination.requested_by_party_id || coordination.owner_party_id,
          metadata: {
            execution_owner: "SECRETARY",
            execution_ready: true,
            execution_instruction: instruction,
            secretary_meeting_coordination_id: coordination.id,
            secretary_meeting_coordination_participant_id: participant.id,
            meeting_schedule_change_notification: true,
            meeting_schedule_change_kind: kind,
            meeting_schedule_change_version: version,
            attendance_not_inferred: true,
            rsvp_not_inferred: true,
            external_authority_used: false,
          },
        })
        .select("id")
        .single();
      if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    }
    ids.push(id);
  }

  const updatedMetadata = {
    ...object(coordination.metadata),
    meeting_change_notifications_materialized: true,
    meeting_change_notifications_materialized_at: new Date().toISOString(),
    meeting_change_notification_count: ids.length,
    meeting_change_notification_follow_up_ids: ids,
    meeting_change_notifications_include_all_participants: true,
    meeting_change_notifications_attendance_not_inferred: true,
    meeting_change_notifications_rsvp_not_inferred: true,
    meeting_change_notification_last_error: null,
    external_authority_used: false,
  };

  await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
      .eq("organization_id", coordination.organization_id)
      .eq("id", coordination.id)
      .select("*")
      .single(),
  );

  return {
    notification_count: ids.length,
    follow_up_ids: ids,
    deterministic_follow_up_ids: true,
    notifications_include_all_participants: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

async function persistNotificationFailure(coordination, error) {
  if (!coordination?.id) return;
  await supabaseAdmin
    .from("secretary_meeting_coordinations")
    .update({
      metadata: {
        ...object(coordination.metadata),
        meeting_change_notifications_materialized: false,
        meeting_change_notification_last_error: text(error?.message || error, 2000),
        meeting_change_notifications_include_all_participants: true,
        meeting_change_notifications_attendance_not_inferred: true,
        meeting_change_notifications_rsvp_not_inferred: true,
        external_authority_used: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", coordination.organization_id)
    .eq("id", coordination.id);
}

function reconstructChangeEvidence(coordination) {
  const metadata = object(coordination.metadata);
  const kind = text(metadata.latest_schedule_change_kind, 40).toUpperCase();
  const version = Number(metadata.schedule_change_version);
  if (!["RESCHEDULE", "CANCEL"].includes(kind) || !Number.isFinite(version) || version < 1) return null;
  return {
    coordination,
    change_kind: kind,
    change_version: version,
    previous_schedule: object(metadata.previous_schedule),
    current_schedule: object(metadata.current_schedule),
    cancellation_reason: text(metadata.cancellation_reason, 1000) || null,
  };
}

export async function repairSecretaryBookedMeetingChangeNotifications({ limit = 8 } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 8, 25));
  const rows = await many(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("*")
      .in("status", ["BOOKED", "CANCELLED"])
      .eq("metadata->>meeting_change_notifications_materialized", "false")
      .order("updated_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(boundedLimit),
  );

  const repaired = [];
  for (const coordination of rows) {
    const change = reconstructChangeEvidence(coordination);
    if (!change) {
      const error = new Error("SECRETARY_BOOKED_MEETING_CHANGE_REPAIR_EVIDENCE_INVALID");
      await persistNotificationFailure(coordination, error);
      repaired.push({ status: "pending_repair", coordination_id: coordination.id, error: error.message });
      continue;
    }
    try {
      repaired.push({
        status: "repaired",
        coordination_id: coordination.id,
        ...(await ensureChangeNotifications(change)),
      });
    } catch (error) {
      await persistNotificationFailure(coordination, error);
      repaired.push({
        status: "pending_repair",
        coordination_id: coordination.id,
        error: text(error?.message || error, 2000),
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
    repair_scan_not_limited_to_recent_changes: true,
    deterministic_follow_up_ids: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function rescheduleSecretaryBookedMeeting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_MEETING_COORDINATION_ID_REQUIRED");
  const startsAt = iso(payload.starts_at || payload.startsAt, "reschedule_start");
  const endsAt = iso(payload.ends_at || payload.endsAt, "reschedule_end");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_BOOKED_MEETING_RESCHEDULE_WINDOW_INVALID");

  const rpc = await supabaseAdmin.rpc("secretary_reschedule_booked_meeting_coordination", {
    p_organization_id: organization,
    p_coordination_id: coordinationId,
    p_changed_by_party_id: actor,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_timezone: text(payload.timezone, 120) || null,
    p_location: payload.location === undefined ? null : text(payload.location, 1000),
  });
  if (rpc.error) throw rpc.error;
  const change = object(rpc.data);

  try {
    const notifications = await ensureChangeNotifications(change);
    return {
      status: "rescheduled",
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_BOOKED_MEETING_CHANGE_V1",
      ...change,
      notifications,
      secretary_owns_notification_follow_through: true,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  } catch (error) {
    await persistNotificationFailure(change.coordination, error);
    return {
      status: "rescheduled_notification_pending_repair",
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_BOOKED_MEETING_CHANGE_V1",
      ...change,
      notification_error: text(error?.message || error, 2000),
      secretary_owns_notification_follow_through: true,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  }
}

export async function cancelSecretaryBookedMeeting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const coordinationId = text(payload.coordination_id || payload.coordinationId, 120);
  if (!coordinationId) throw new Error("SECRETARY_MEETING_COORDINATION_ID_REQUIRED");

  const rpc = await supabaseAdmin.rpc("secretary_cancel_booked_meeting_coordination", {
    p_organization_id: organization,
    p_coordination_id: coordinationId,
    p_changed_by_party_id: actor,
    p_reason: text(payload.reason, 1000) || null,
  });
  if (rpc.error) throw rpc.error;
  const change = object(rpc.data);

  try {
    const notifications = await ensureChangeNotifications(change);
    return {
      status: "cancelled",
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_BOOKED_MEETING_CHANGE_V1",
      ...change,
      notifications,
      calendar_event_cancelled: true,
      secretary_owns_notification_follow_through: true,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  } catch (error) {
    await persistNotificationFailure(change.coordination, error);
    return {
      status: "cancelled_notification_pending_repair",
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_BOOKED_MEETING_CHANGE_V1",
      ...change,
      notification_error: text(error?.message || error, 2000),
      calendar_event_cancelled: true,
      secretary_owns_notification_follow_through: true,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  }
}

export default Object.freeze({
  reschedule: rescheduleSecretaryBookedMeeting,
  cancel: cancelSecretaryBookedMeeting,
  repairNotifications: repairSecretaryBookedMeetingChangeNotifications,
});
