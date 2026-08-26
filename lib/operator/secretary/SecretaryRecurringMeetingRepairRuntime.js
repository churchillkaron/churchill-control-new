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

function deterministicFollowUpId(seedParts) {
  const hex = createHash("sha256").update(seedParts.join(":")).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function roster(series) {
  return many(
    supabaseAdmin
      .from("secretary_recurring_meeting_participants")
      .select("*")
      .eq("organization_id", series.organization_id)
      .eq("series_id", series.id)
      .order("created_at", { ascending: true }),
  );
}

async function occurrenceRows(series) {
  return many(
    supabaseAdmin
      .from("secretary_recurring_meeting_occurrences")
      .select("*")
      .eq("organization_id", series.organization_id)
      .eq("series_id", series.id)
      .order("occurrence_index", { ascending: true }),
  );
}

function seriesInstruction(series, kind, occurrences) {
  if (kind === "SERIES_CREATED") {
    const times = occurrences
      .map((row) => `#${row.occurrence_index}: ${row.current_starts_at} to ${row.current_ends_at}`)
      .join("; ");
    return [
      `Notify the participant that the recurring meeting series \"${text(series.title, 500)}\" has been scheduled.`,
      `Timezone: ${text(series.timezone, 120)}.`,
      series.location ? `Location: ${text(series.location, 1000)}.` : null,
      `Occurrences: ${times}.`,
      "This is a scheduling notice only. Do not state or imply RSVP or attendance confirmation.",
    ].filter(Boolean).join(" ");
  }

  const metadata = object(series.metadata);
  return [
    `Notify the participant that future occurrences of recurring meeting \"${text(series.title, 500)}\" are cancelled from ${text(metadata.cancelled_from, 160)} onward.`,
    metadata.cancel_reason ? `Reason: ${text(metadata.cancel_reason, 1000)}.` : null,
    "Past and pre-cutoff occurrences remain historical or scheduled according to the series. Do not imply anything about RSVP or attendance.",
  ].filter(Boolean).join(" ");
}

function occurrenceInstruction(series, occurrence, kind) {
  const metadata = object(occurrence.metadata);
  if (kind === "MOVE") {
    return [
      `Notify the participant that occurrence #${occurrence.occurrence_index} of recurring meeting \"${text(series.title, 500)}\" has moved.`,
      `New time: ${occurrence.current_starts_at} to ${occurrence.current_ends_at} (${text(series.timezone, 120)}).`,
      "This replaces the previous time for this occurrence only. Do not imply RSVP or attendance confirmation.",
      "Ask them to reply if the new time does not work.",
    ].join(" ");
  }
  return [
    `Notify the participant that occurrence #${occurrence.occurrence_index} of recurring meeting \"${text(series.title, 500)}\" is skipped/cancelled.`,
    metadata.skip_reason ? `Reason: ${text(metadata.skip_reason, 1000)}.` : null,
    "Other occurrences remain unchanged. Do not imply anything about RSVP or attendance.",
  ].filter(Boolean).join(" ");
}

async function ensureNotifications({ series, occurrence = null, kind, version }) {
  const participants = await roster(series);
  const occurrences = occurrence ? [] : await occurrenceRows(series);
  const ids = [];

  for (const participant of participants) {
    const id = deterministicFollowUpId([
      "avantiqo-secretary-recurring-meeting-notification-v1",
      series.id,
      participant.id,
      kind,
      version,
      occurrence?.id || "series",
    ]);
    const instruction = occurrence
      ? occurrenceInstruction(series, occurrence, kind)
      : seriesInstruction(series, kind, occurrences);

    const existing = await one(
      supabaseAdmin
        .from("secretary_follow_ups")
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
    deterministic_follow_up_ids: true,
    notifications_include_all_participants: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

async function repairSeries(series) {
  const metadata = object(series.metadata);
  const kind = text(metadata.latest_change_kind, 40).toUpperCase();
  if (!["SERIES_CREATED", "CANCEL_FUTURE"].includes(kind)) {
    throw new Error("SECRETARY_RECURRING_MEETING_SERIES_REPAIR_EVIDENCE_INVALID");
  }
  const version = Number(metadata.series_change_version || 0);
  if (!Number.isFinite(version) || version < 0) throw new Error("SECRETARY_RECURRING_MEETING_SERIES_REPAIR_VERSION_INVALID");
  const notifications = await ensureNotifications({ series, kind, version });
  await one(
    supabaseAdmin.from("secretary_recurring_meeting_series")
      .update({
        metadata: {
          ...metadata,
          recurring_notification_materialized: true,
          recurring_notification_materialized_at: new Date().toISOString(),
          recurring_notification_last_error: null,
          recurring_notification_count: notifications.notification_count,
          recurring_notification_follow_up_ids: notifications.follow_up_ids,
          attendance_not_inferred: true,
          rsvp_not_inferred: true,
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", series.organization_id)
      .eq("id", series.id)
      .select("*")
      .single(),
  );
  return { status: "repaired", target: "series", series_id: series.id, kind, ...notifications };
}

async function repairOccurrence(occurrence) {
  const metadata = object(occurrence.metadata);
  const kind = text(metadata.latest_change_kind, 40).toUpperCase();
  if (!["MOVE", "SKIP"].includes(kind)) {
    throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCE_REPAIR_EVIDENCE_INVALID");
  }
  const version = Number(metadata.latest_change_version || occurrence.change_version || 0);
  if (!Number.isFinite(version) || version < 1) throw new Error("SECRETARY_RECURRING_MEETING_OCCURRENCE_REPAIR_VERSION_INVALID");
  const series = await one(
    supabaseAdmin.from("secretary_recurring_meeting_series")
      .select("*")
      .eq("organization_id", occurrence.organization_id)
      .eq("id", occurrence.series_id)
      .maybeSingle(),
  );
  if (!series) throw new Error("SECRETARY_RECURRING_MEETING_SERIES_NOT_FOUND");
  const notifications = await ensureNotifications({ series, occurrence, kind, version });
  await one(
    supabaseAdmin.from("secretary_recurring_meeting_occurrences")
      .update({
        metadata: {
          ...metadata,
          recurring_notification_materialized: true,
          recurring_notification_materialized_at: new Date().toISOString(),
          recurring_notification_last_error: null,
          recurring_notification_count: notifications.notification_count,
          recurring_notification_follow_up_ids: notifications.follow_up_ids,
          attendance_not_inferred: true,
          rsvp_not_inferred: true,
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", occurrence.organization_id)
      .eq("id", occurrence.id)
      .select("*")
      .single(),
  );
  return { status: "repaired", target: "occurrence", series_id: series.id, occurrence_id: occurrence.id, kind, ...notifications };
}

export async function repairSecretaryRecurringMeetingNotifications({ limit = 8 } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 8, 25));
  const [seriesRows, occurrenceRowsValue] = await Promise.all([
    many(
      supabaseAdmin.from("secretary_recurring_meeting_series")
        .select("*")
        .eq("metadata->>recurring_notification_materialized", "false")
        .order("updated_at", { ascending: true })
        .limit(boundedLimit),
    ),
    many(
      supabaseAdmin.from("secretary_recurring_meeting_occurrences")
        .select("*")
        .eq("metadata->>recurring_notification_materialized", "false")
        .order("updated_at", { ascending: true })
        .limit(boundedLimit),
    ),
  ]);

  const repaired = [];
  for (const series of seriesRows) {
    try {
      repaired.push(await repairSeries(series));
    } catch (error) {
      await supabaseAdmin.from("secretary_recurring_meeting_series")
        .update({
          metadata: {
            ...object(series.metadata),
            recurring_notification_materialized: false,
            recurring_notification_last_error: text(error?.message || error, 2000),
            attendance_not_inferred: true,
            rsvp_not_inferred: true,
            external_authority_used: false,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", series.organization_id)
        .eq("id", series.id);
      repaired.push({ status: "pending_repair", target: "series", series_id: series.id, error: text(error?.message || error, 2000) });
    }
  }

  for (const occurrence of occurrenceRowsValue) {
    try {
      repaired.push(await repairOccurrence(occurrence));
    } catch (error) {
      await supabaseAdmin.from("secretary_recurring_meeting_occurrences")
        .update({
          metadata: {
            ...object(occurrence.metadata),
            recurring_notification_materialized: false,
            recurring_notification_last_error: text(error?.message || error, 2000),
            attendance_not_inferred: true,
            rsvp_not_inferred: true,
            external_authority_used: false,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", occurrence.organization_id)
        .eq("id", occurrence.id);
      repaired.push({ status: "pending_repair", target: "occurrence", series_id: occurrence.series_id, occurrence_id: occurrence.id, error: text(error?.message || error, 2000) });
    }
  }

  return {
    status: "completed",
    series_candidates: seriesRows.length,
    occurrence_candidates: occurrenceRowsValue.length,
    repaired,
    repair_candidates_selected_server_side: true,
    oldest_unfinished_first: true,
    repair_scan_not_limited_to_recent_changes: true,
    deterministic_follow_up_ids: true,
    notifications_include_all_participants: true,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export default Object.freeze({ repair: repairSecretaryRecurringMeetingNotifications });
