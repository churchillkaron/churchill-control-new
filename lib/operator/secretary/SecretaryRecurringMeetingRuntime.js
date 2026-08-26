import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
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
  if (!raw || !Number.isFinite(Date.parse(raw))) throw new Error(`SECRETARY_RECURRING_MEETING_${field.toUpperCase()}_INVALID`);
  return new Date(raw).toISOString();
}

function normalizeOccurrences(value) {
  const rows = list(value).slice(0, 104).map((item, index) => {
    const row = object(item);
    const startsAt = iso(row.starts_at || row.startsAt, "occurrence_start");
    const endsAt = iso(row.ends_at || row.endsAt, "occurrence_end");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCE_WINDOW_INVALID");
    return {
      occurrence_index: Number(row.occurrence_index || row.occurrenceIndex || index + 1),
      starts_at: startsAt,
      ends_at: endsAt,
    };
  });
  if (rows.length < 2) throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCES_REQUIRED");
  const indexes = rows.map((row) => row.occurrence_index);
  if (indexes.some((value) => !Number.isInteger(value) || value < 1 || value > 104) || new Set(indexes).size !== indexes.length) {
    throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCE_INDEX_INVALID");
  }
  return rows.sort((a, b) => a.occurrence_index - b.occurrence_index);
}

function deterministicFollowUpId(seedParts) {
  const hex = createHash("sha256").update(seedParts.join(":")).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function participants(series) {
  return many(
    supabaseAdmin
      .from("secretary_recurring_meeting_participants")
      .select("*")
      .eq("organization_id", series.organization_id)
      .eq("series_id", series.id)
      .order("created_at", { ascending: true }),
  );
}

async function occurrenceRows(seriesId, organization) {
  return many(
    supabaseAdmin
      .from("secretary_recurring_meeting_occurrences")
      .select("*")
      .eq("organization_id", organization)
      .eq("series_id", seriesId)
      .order("occurrence_index", { ascending: true }),
  );
}

function creationInstruction(series, occurrenceRowsValue) {
  const times = occurrenceRowsValue.map((row) => `#${row.occurrence_index}: ${row.current_starts_at} to ${row.current_ends_at}`).join("; ");
  return [
    `Notify the participant that the recurring meeting series \"${text(series.title, 500)}\" has been scheduled.`,
    `Timezone: ${text(series.timezone, 120)}.`,
    series.location ? `Location: ${text(series.location, 1000)}.` : null,
    `Occurrences: ${times}.`,
    "This is a scheduling notice only. Do not state or imply RSVP or attendance confirmation.",
  ].filter(Boolean).join(" ");
}

function changeInstruction(series, kind, occurrence, payload = {}) {
  if (kind === "MOVE") {
    return [
      `Notify the participant that occurrence #${occurrence.occurrence_index} of recurring meeting \"${text(series.title, 500)}\" has moved.`,
      `New time: ${occurrence.current_starts_at} to ${occurrence.current_ends_at} (${text(series.timezone, 120)}).`,
      "This replaces the previous time for this occurrence only. Do not imply RSVP or attendance confirmation.",
      "Ask them to reply if the new time does not work.",
    ].join(" ");
  }
  if (kind === "SKIP") {
    return [
      `Notify the participant that occurrence #${occurrence.occurrence_index} of recurring meeting \"${text(series.title, 500)}\" is skipped/cancelled.`,
      payload.reason ? `Reason: ${text(payload.reason, 1000)}.` : null,
      "Other occurrences remain unchanged. Do not imply anything about RSVP or attendance.",
    ].filter(Boolean).join(" ");
  }
  return [
    `Notify the participant that future occurrences of recurring meeting \"${text(series.title, 500)}\" are cancelled from ${text(payload.cancelled_from, 160)} onward.`,
    payload.reason ? `Reason: ${text(payload.reason, 1000)}.` : null,
    "Past occurrences remain historical records. Do not imply anything about RSVP or attendance.",
  ].filter(Boolean).join(" ");
}

async function ensureParticipantFollowUps({ series, kind, version, occurrence = null, payload = {} }) {
  const roster = await participants(series);
  const occurrences = kind === "SERIES_CREATED" ? await occurrenceRows(series.id, series.organization_id) : [];
  const ids = [];

  for (const participant of roster) {
    const id = deterministicFollowUpId([
      "avantiqo-secretary-recurring-meeting-notification-v1",
      series.id,
      participant.id,
      kind,
      version,
      occurrence?.id || "series",
    ]);
    const instruction = kind === "SERIES_CREATED"
      ? creationInstruction(series, occurrences)
      : changeInstruction(series, kind, occurrence, payload);
    const existing = await one(
      supabaseAdmin.from("secretary_follow_ups")
        .select("id")
        .eq("organization_id", series.organization_id)
        .eq("id", id)
        .maybeSingle(),
    );
    if (!existing) {
      const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
        id,
        organization_id: series.organization_id,
        entity_id: series.entity_id || null,
        owner_party_id: series.requested_by_party_id || series.owner_party_id,
        contact_party_id: participant.party_id,
        calendar_event_id: occurrence?.calendar_event_id || null,
        action_type: participant.action_type,
        reason: instruction,
        status: "PENDING",
        due_at: new Date().toISOString(),
        created_by_party_id: series.requested_by_party_id || series.owner_party_id,
        metadata: {
          execution_owner: "SECRETARY",
          execution_ready: true,
          execution_instruction: instruction,
          secretary_recurring_series_id: series.id,
          secretary_recurring_occurrence_id: occurrence?.id || null,
          recurring_meeting_notification: true,
          recurring_meeting_change_notification: kind !== "SERIES_CREATED",
          recurring_meeting_notification_kind: kind,
          recurring_meeting_notification_version: version,
          attendance_not_inferred: true,
          rsvp_not_inferred: true,
          external_authority_used: false,
        },
      }).select("id").single();
      if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    }
    ids.push(id);
  }
  return {
    notification_count: ids.length,
    follow_up_ids: ids,
    notifications_include_all_participants: true,
    deterministic_follow_up_ids: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

async function markSeriesNotificationState(series, ok, error = null) {
  await supabaseAdmin.from("secretary_recurring_meeting_series").update({
    metadata: {
      ...object(series.metadata),
      recurring_notification_materialized: ok,
      recurring_notification_materialized_at: ok ? new Date().toISOString() : null,
      recurring_notification_last_error: error ? text(error?.message || error, 2000) : null,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    },
    updated_at: new Date().toISOString(),
  }).eq("organization_id", series.organization_id).eq("id", series.id);
}

async function markOccurrenceNotificationState(occurrence, ok, error = null) {
  await supabaseAdmin.from("secretary_recurring_meeting_occurrences").update({
    metadata: {
      ...object(occurrence.metadata),
      recurring_notification_materialized: ok,
      recurring_notification_materialized_at: ok ? new Date().toISOString() : null,
      recurring_notification_last_error: error ? text(error?.message || error, 2000) : null,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    },
    updated_at: new Date().toISOString(),
  }).eq("organization_id", occurrence.organization_id).eq("id", occurrence.id);
}

export async function createSecretaryRecurringMeetingSeries({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const title = text(payload.title, 500);
  if (!title) throw new Error("SECRETARY_RECURRING_MEETING_TITLE_REQUIRED");
  const timezone = text(payload.timezone || context.timezone, 120);
  if (!timezone) throw new Error("SECRETARY_RECURRING_MEETING_TIMEZONE_REQUIRED");
  const occurrenceList = normalizeOccurrences(payload.occurrences);
  const participantList = list(payload.participants).slice(0, 50).map((item) => {
    const row = object(item);
    const partyId = text(row.party_id || row.partyId, 120);
    const actionType = text(row.action_type || row.actionType, 40).toUpperCase() || "MESSAGE";
    if (!partyId || !["CALL", "MESSAGE", "EMAIL"].includes(actionType)) throw new Error("SECRETARY_RECURRING_MEETING_PARTICIPANT_INVALID");
    return { party_id: partyId, required: row.required !== false, action_type: actionType };
  });
  if (!participantList.length) throw new Error("SECRETARY_RECURRING_MEETING_PARTICIPANTS_REQUIRED");

  const rpc = await supabaseAdmin.rpc("secretary_create_recurring_meeting_series", {
    p_organization_id: organization,
    p_requested_by_party_id: actor,
    p_owner_party_id: text(payload.owner_party_id || payload.ownerPartyId, 120) || actor,
    p_title: title,
    p_timezone: timezone,
    p_occurrences: occurrenceList,
    p_participants: participantList,
    p_recurrence_rule: object(payload.recurrence_rule || payload.recurrenceRule),
    p_entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    p_description: text(payload.description, 4000) || null,
    p_location: text(payload.location, 1000) || null,
    p_metadata: { ...object(payload.metadata), attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false },
  });
  if (rpc.error) throw rpc.error;
  const result = object(rpc.data);
  const series = object(result.series);

  try {
    const notifications = await ensureParticipantFollowUps({ series, kind: "SERIES_CREATED", version: 0 });
    await markSeriesNotificationState(series, true);
    return {
      status: "created",
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1",
      ...result,
      notifications,
      secretary_owns_notification_follow_through: true,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  } catch (error) {
    await markSeriesNotificationState(series, false, error);
    return {
      status: "created_notification_pending_repair",
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1",
      ...result,
      notification_error: text(error?.message || error, 2000),
      secretary_owns_notification_follow_through: true,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  }
}

export async function moveSecretaryRecurringMeetingOccurrence({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const occurrenceId = text(payload.occurrence_id || payload.occurrenceId, 120);
  if (!occurrenceId) throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCE_ID_REQUIRED");
  const startsAt = iso(payload.starts_at || payload.startsAt, "move_start");
  const endsAt = iso(payload.ends_at || payload.endsAt, "move_end");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_RECURRING_MEETING_MOVE_WINDOW_INVALID");
  const rpc = await supabaseAdmin.rpc("secretary_move_recurring_meeting_occurrence", {
    p_organization_id: organization,
    p_occurrence_id: occurrenceId,
    p_changed_by_party_id: actor,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_timezone: text(payload.timezone, 120) || null,
    p_location: payload.location === undefined ? null : text(payload.location, 1000),
  });
  if (rpc.error) throw rpc.error;
  const result = object(rpc.data);
  try {
    const notifications = await ensureParticipantFollowUps({ series: object(result.series), kind: "MOVE", version: Number(result.change_version), occurrence: object(result.occurrence) });
    await markOccurrenceNotificationState(object(result.occurrence), true);
    return { status: "moved", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1", ...result, notifications, attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false };
  } catch (error) {
    await markOccurrenceNotificationState(object(result.occurrence), false, error);
    return { status: "moved_notification_pending_repair", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1", ...result, notification_error: text(error?.message || error, 2000), attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false };
  }
}

export async function skipSecretaryRecurringMeetingOccurrence({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const occurrenceId = text(payload.occurrence_id || payload.occurrenceId, 120);
  if (!occurrenceId) throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCE_ID_REQUIRED");
  const rpc = await supabaseAdmin.rpc("secretary_skip_recurring_meeting_occurrence", {
    p_organization_id: organization,
    p_occurrence_id: occurrenceId,
    p_changed_by_party_id: actor,
    p_reason: text(payload.reason, 1000) || null,
  });
  if (rpc.error) throw rpc.error;
  const result = object(rpc.data);
  try {
    const notifications = await ensureParticipantFollowUps({ series: object(result.series), kind: "SKIP", version: Number(result.change_version), occurrence: object(result.occurrence), payload: { reason: result.reason } });
    await markOccurrenceNotificationState(object(result.occurrence), true);
    return { status: "skipped", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1", ...result, notifications, attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false };
  } catch (error) {
    await markOccurrenceNotificationState(object(result.occurrence), false, error);
    return { status: "skipped_notification_pending_repair", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1", ...result, notification_error: text(error?.message || error, 2000), attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false };
  }
}

export async function cancelSecretaryRecurringMeetingFuture({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const seriesId = text(payload.series_id || payload.seriesId, 120);
  if (!seriesId) throw new Error("SECRETARY_RECURRING_MEETING_SERIES_ID_REQUIRED");
  const cancelledFrom = iso(payload.from || payload.cancelled_from || payload.cancelledFrom, "cancel_future_from");
  const rpc = await supabaseAdmin.rpc("secretary_cancel_recurring_meeting_future", {
    p_organization_id: organization,
    p_series_id: seriesId,
    p_changed_by_party_id: actor,
    p_from: cancelledFrom,
    p_reason: text(payload.reason, 1000) || null,
  });
  if (rpc.error) throw rpc.error;
  const result = object(rpc.data);
  try {
    const notifications = await ensureParticipantFollowUps({ series: object(result.series), kind: "CANCEL_FUTURE", version: Number(result.change_version), payload: { cancelled_from: result.cancelled_from, reason: result.reason } });
    await markSeriesNotificationState(object(result.series), true);
    return { status: "future_cancelled", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1", ...result, notifications, attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false };
  } catch (error) {
    await markSeriesNotificationState(object(result.series), false, error);
    return { status: "future_cancelled_notification_pending_repair", contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1", ...result, notification_error: text(error?.message || error, 2000), attendance_not_inferred: true, rsvp_not_inferred: true, external_authority_used: false };
  }
}

export async function readSecretaryRecurringMeetingSeries({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const seriesId = text(payload.series_id || payload.seriesId, 120);
  if (!seriesId) throw new Error("SECRETARY_RECURRING_MEETING_SERIES_ID_REQUIRED");
  const series = await one(
    supabaseAdmin.from("secretary_recurring_meeting_series").select("*")
      .eq("organization_id", organization).eq("id", seriesId).maybeSingle(),
  );
  if (!series) throw new Error("SECRETARY_RECURRING_MEETING_SERIES_NOT_FOUND");
  const [roster, occurrences] = await Promise.all([participants(series), occurrenceRows(series.id, organization)]);
  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_STATUS_V1",
    series,
    participants: roster,
    occurrences,
    attendance_confirmed_party_ids: [],
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export default Object.freeze({
  create: createSecretaryRecurringMeetingSeries,
  moveOccurrence: moveSecretaryRecurringMeetingOccurrence,
  skipOccurrence: skipSecretaryRecurringMeetingOccurrence,
  cancelFuture: cancelSecretaryRecurringMeetingFuture,
  read: readSecretaryRecurringMeetingSeries,
});
