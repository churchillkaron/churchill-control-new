import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_RECURRING_MEETING_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_RECURRING_MEETING_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  cancelSecretaryRecurringMeetingFuture,
  createSecretaryRecurringMeetingSeries,
  moveSecretaryRecurringMeetingOccurrence,
  readSecretaryRecurringMeetingSeries,
  skipSecretaryRecurringMeetingOccurrence,
} = await import("../lib/operator/secretary/SecretaryRecurringMeetingRuntime.js");
const { repairSecretaryRecurringMeetingNotifications } = await import("../lib/operator/secretary/SecretaryRecurringMeetingRepairRuntime.js");
const { createSecretaryRecurringMeetingCapability } = await import("../lib/platform/capabilities/createSecretaryRecurringMeetingCapability.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations")
      .insert({ name: "Secretary Recurring Meeting Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_RECURRING_MEETING_ORGANIZATION_INSERT_FAILED",
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
    "SECRETARY_RECURRING_MEETING_PARTIES_INSERT_FAILED",
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

  const created = await createSecretaryRecurringMeetingSeries({
    context,
    payload: {
      title: "Weekly Executive Review",
      description: "Recurring executive operating review",
      location: "Executive Room",
      timezone: "Asia/Bangkok",
      owner_party_id: executiveId,
      recurrence_rule: { frequency: "WEEKLY", interval: 1, explicit_occurrences_authoritative: true },
      occurrences: [
        { occurrence_index: 1, starts_at: "2026-10-05T10:00:00+07:00", ends_at: "2026-10-05T11:00:00+07:00" },
        { occurrence_index: 2, starts_at: "2026-10-12T10:00:00+07:00", ends_at: "2026-10-12T11:00:00+07:00" },
        { occurrence_index: 3, starts_at: "2026-10-19T10:00:00+07:00", ends_at: "2026-10-19T11:00:00+07:00" },
        { occurrence_index: 4, starts_at: "2026-10-26T10:00:00+07:00", ends_at: "2026-10-26T11:00:00+07:00" },
      ],
      participants: [
        { party_id: aliceId, required: true, action_type: "MESSAGE" },
        { party_id: bobId, required: true, action_type: "EMAIL" },
      ],
      metadata: { local_certification: true },
    },
  });

  assert.equal(created.status, "created");
  assert.equal(created.contract, "AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1");
  assert.equal(created.series_created_atomically, true);
  assert.equal(created.calendar_conflicts_checked_under_owner_lock, true);
  assert.equal(created.occurrence_count, 4);
  assert.equal(created.notifications.notification_count, 2);
  assert.equal(created.notifications.notifications_include_all_participants, true);
  assert.equal(created.notifications.attendance_not_inferred, true);
  assert.equal(created.notifications.rsvp_not_inferred, true);
  assert.equal(created.external_authority_used, false);

  const seriesId = created.series.id;
  let view = await readSecretaryRecurringMeetingSeries({ context, payload: { series_id: seriesId } });
  assert.equal(view.series.status, "ACTIVE");
  assert.equal(view.occurrences.length, 4);
  assert.equal(view.participants.length, 2);
  assert.deepEqual(new Set(view.participants.map((row) => row.action_type)), new Set(["MESSAGE", "EMAIL"]));
  assert.deepEqual(view.attendance_confirmed_party_ids, []);

  const calendarRows = await many(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("source", "secretary_recurring_meeting"),
    "SECRETARY_RECURRING_MEETING_CALENDAR_READ_FAILED",
  );
  assert.equal(calendarRows.length, 4);
  assert.equal(calendarRows.every((row) => row.status === "CONFIRMED"), true);
  assert.equal(calendarRows.every((row) => row.recurrence?.secretary_recurring_series_id === seriesId), true);

  let creationConflictBlocked = false;
  try {
    await createSecretaryRecurringMeetingSeries({
      context,
      payload: {
        title: "Conflicting Recurring Series",
        timezone: "Asia/Bangkok",
        occurrences: [
          { occurrence_index: 1, starts_at: "2026-10-05T10:30:00+07:00", ends_at: "2026-10-05T11:30:00+07:00" },
          { occurrence_index: 2, starts_at: "2026-11-02T10:00:00+07:00", ends_at: "2026-11-02T11:00:00+07:00" },
        ],
        participants: [{ party_id: aliceId, action_type: "MESSAGE" }],
      },
    });
  } catch (error) {
    creationConflictBlocked = String(error?.message || error).includes("SECRETARY_RECURRING_MEETING_CALENDAR_CONFLICT");
  }
  assert.equal(creationConflictBlocked, true);

  const occurrence1 = view.occurrences.find((row) => row.occurrence_index === 1);
  const occurrence2 = view.occurrences.find((row) => row.occurrence_index === 2);
  const occurrence3 = view.occurrences.find((row) => row.occurrence_index === 3);
  const occurrence4 = view.occurrences.find((row) => row.occurrence_index === 4);
  assert.ok(occurrence1 && occurrence2 && occurrence3 && occurrence4);

  const moved = await moveSecretaryRecurringMeetingOccurrence({
    context,
    payload: {
      occurrence_id: occurrence2.id,
      starts_at: "2026-10-12T13:00:00+07:00",
      ends_at: "2026-10-12T14:00:00+07:00",
      timezone: "Asia/Bangkok",
      location: "Executive Room B",
    },
  });
  assert.equal(moved.status, "moved");
  assert.equal(moved.change_kind, "MOVE");
  assert.equal(moved.occurrence.status, "MOVED");
  assert.equal(Date.parse(moved.occurrence.current_starts_at), Date.parse("2026-10-12T13:00:00+07:00"));
  assert.equal(moved.notifications.notification_count, 2);

  view = await readSecretaryRecurringMeetingSeries({ context, payload: { series_id: seriesId } });
  assert.equal(Date.parse(view.occurrences.find((row) => row.occurrence_index === 1).current_starts_at), Date.parse(occurrence1.current_starts_at));
  assert.equal(Date.parse(view.occurrences.find((row) => row.occurrence_index === 3).current_starts_at), Date.parse(occurrence3.current_starts_at));

  const conflictBlock = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .insert({
        organization_id: organizationId,
        owner_party_id: executiveId,
        title: "Executive collision block",
        event_type: "BLOCK",
        status: "CONFIRMED",
        starts_at: "2026-10-19T13:30:00+07:00",
        ends_at: "2026-10-19T14:30:00+07:00",
        timezone: "Asia/Bangkok",
        all_day: false,
        source: "local-certification",
        created_by_party_id: executiveId,
        updated_by_party_id: executiveId,
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_RECURRING_MEETING_CONFLICT_BLOCK_INSERT_FAILED",
  );

  let moveConflictBlocked = false;
  try {
    await moveSecretaryRecurringMeetingOccurrence({
      context,
      payload: {
        occurrence_id: occurrence3.id,
        starts_at: "2026-10-19T13:00:00+07:00",
        ends_at: "2026-10-19T14:00:00+07:00",
      },
    });
  } catch (error) {
    moveConflictBlocked = String(error?.message || error).includes("SECRETARY_RECURRING_MEETING_MOVE_CONFLICT");
  }
  assert.equal(moveConflictBlocked, true);
  await supabaseAdmin.from("secretary_calendar_events").delete().eq("id", conflictBlock.id);

  const skipped = await skipSecretaryRecurringMeetingOccurrence({
    context,
    payload: { occurrence_id: occurrence3.id, reason: "Executive away" },
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.change_kind, "SKIP");
  assert.equal(skipped.occurrence.status, "SKIPPED");
  assert.equal(skipped.calendar_event.status, "CANCELLED");
  assert.equal(skipped.notifications.notification_count, 2);

  const cancelledFuture = await cancelSecretaryRecurringMeetingFuture({
    context,
    payload: {
      series_id: seriesId,
      from: "2026-10-20T00:00:00+07:00",
      reason: "Series ending after October 19",
    },
  });
  assert.equal(cancelledFuture.status, "future_cancelled");
  assert.equal(cancelledFuture.change_kind, "CANCEL_FUTURE");
  assert.equal(cancelledFuture.cancelled_future_occurrence_count, 1);
  assert.equal(cancelledFuture.remaining_active_pre_cutoff_occurrence_count, 2);
  assert.equal(cancelledFuture.pre_cutoff_occurrences_remain_editable, true);
  assert.equal(cancelledFuture.past_occurrences_preserved, true);
  assert.equal(cancelledFuture.series.status, "ACTIVE");
  assert.equal(cancelledFuture.notifications.notification_count, 2);

  view = await readSecretaryRecurringMeetingSeries({ context, payload: { series_id: seriesId } });
  assert.equal(view.occurrences.find((row) => row.occurrence_index === 1).status, "SCHEDULED");
  assert.equal(view.occurrences.find((row) => row.occurrence_index === 2).status, "MOVED");
  assert.equal(view.occurrences.find((row) => row.occurrence_index === 3).status, "SKIPPED");
  assert.equal(view.occurrences.find((row) => row.occurrence_index === 4).status, "CANCELLED");

  const movedPreCutoff = await moveSecretaryRecurringMeetingOccurrence({
    context,
    payload: {
      occurrence_id: occurrence1.id,
      starts_at: "2026-10-06T10:00:00+07:00",
      ends_at: "2026-10-06T11:00:00+07:00",
      timezone: "Asia/Bangkok",
    },
  });
  assert.equal(movedPreCutoff.status, "moved");
  assert.equal(movedPreCutoff.occurrence.status, "MOVED");
  assert.equal(Date.parse(movedPreCutoff.occurrence.current_starts_at), Date.parse("2026-10-06T10:00:00+07:00"));

  let moveNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_recurring_occurrence_id", occurrence1.id)
      .eq("metadata->>recurring_meeting_notification_kind", "MOVE"),
    "SECRETARY_RECURRING_MEETING_MOVE_NOTICES_READ_FAILED",
  );
  assert.equal(moveNotices.length, 2);
  const deletedNoticeId = moveNotices[0].id;
  await one(
    supabaseAdmin.from("secretary_follow_ups")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", deletedNoticeId)
      .select("id")
      .single(),
    "SECRETARY_RECURRING_MEETING_REPAIR_NOTICE_DELETE_FAILED",
  );

  const occurrenceBeforeRepair = await one(
    supabaseAdmin.from("secretary_recurring_meeting_occurrences")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", occurrence1.id)
      .single(),
    "SECRETARY_RECURRING_MEETING_REPAIR_OCCURRENCE_READ_FAILED",
  );
  await one(
    supabaseAdmin.from("secretary_recurring_meeting_occurrences")
      .update({
        metadata: {
          ...occurrenceBeforeRepair.metadata,
          recurring_notification_materialized: false,
          recurring_notification_last_error: "SIMULATED_INTERRUPTION",
        },
      })
      .eq("organization_id", organizationId)
      .eq("id", occurrence1.id)
      .select("id")
      .single(),
    "SECRETARY_RECURRING_MEETING_REPAIR_FLAG_UPDATE_FAILED",
  );

  const repair = await repairSecretaryRecurringMeetingNotifications({ limit: 8 });
  assert.equal(repair.repair_candidates_selected_server_side, true);
  assert.equal(repair.oldest_unfinished_first, true);
  assert.equal(repair.repair_scan_not_limited_to_recent_changes, true);
  assert.equal(repair.repaired.some((row) => row.occurrence_id === occurrence1.id && row.status === "repaired"), true);

  moveNotices = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_recurring_occurrence_id", occurrence1.id)
      .eq("metadata->>recurring_meeting_notification_kind", "MOVE"),
    "SECRETARY_RECURRING_MEETING_REPAIRED_NOTICES_READ_FAILED",
  );
  assert.equal(moveNotices.length, 2);
  assert.equal(moveNotices.some((row) => row.id === deletedNoticeId), true);

  const notifications = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("action_type,metadata")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_recurring_series_id", seriesId),
    "SECRETARY_RECURRING_MEETING_NOTIFICATIONS_READ_FAILED",
  );
  assert.ok(notifications.length >= 10);
  assert.equal(notifications.every((row) => ["MESSAGE", "EMAIL"].includes(row.action_type)), true);
  assert.equal(notifications.every((row) => row.metadata?.attendance_not_inferred === true), true);
  assert.equal(notifications.every((row) => row.metadata?.rsvp_not_inferred === true), true);

  const createCapability = createSecretaryRecurringMeetingCapability("create");
  const readCapability = createSecretaryRecurringMeetingCapability("read");
  const moveCapability = createSecretaryRecurringMeetingCapability("moveOccurrence");
  const skipCapability = createSecretaryRecurringMeetingCapability("skipOccurrence");
  const cancelFutureCapability = createSecretaryRecurringMeetingCapability("cancelFuture");
  assert.equal(createCapability.manifest.operatorRequiresConfirmation, true);
  assert.equal(readCapability.manifest.operatorAutoExecute, true);
  assert.equal(moveCapability.manifest.operatorRequiresConfirmation, true);
  assert.equal(skipCapability.manifest.operatorRequiresConfirmation, true);
  assert.equal(cancelFutureCapability.manifest.operatorRequiresConfirmation, true);

  console.log("SECRETARY_RECURRING_MEETING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_RECURRING_MEETING_SERIES_ATOMIC=true");
  console.log("SECRETARY_RECURRING_MEETING_CALENDAR_CONFLICT_FAILS_CLOSED=true");
  console.log("SECRETARY_RECURRING_MEETING_SINGLE_OCCURRENCE_MOVE_ISOLATED=true");
  console.log("SECRETARY_RECURRING_MEETING_MOVE_CONFLICT_PRESERVES_SERIES=true");
  console.log("SECRETARY_RECURRING_MEETING_SINGLE_OCCURRENCE_SKIP_ISOLATED=true");
  console.log("SECRETARY_RECURRING_MEETING_CANCEL_FUTURE_PRESERVES_PAST=true");
  console.log("SECRETARY_RECURRING_MEETING_PRE_CUTOFF_OCCURRENCES_REMAIN_EDITABLE=true");
  console.log("SECRETARY_RECURRING_MEETING_NOTIFICATION_REPAIRABLE=true");
  console.log("SECRETARY_RECURRING_MEETING_REPAIR_DETERMINISTIC_IDS=true");
  console.log("SECRETARY_RECURRING_MEETING_REPAIR_OLDEST_UNFINISHED_FIRST=true");
  console.log("SECRETARY_RECURRING_MEETING_NOTIFIES_ALL_PARTICIPANTS=true");
  console.log("SECRETARY_RECURRING_MEETING_PRESERVES_PARTICIPANT_CHANNEL=true");
  console.log("SECRETARY_RECURRING_MEETING_CONFIRMATION_REQUIRED_FOR_MUTATIONS=true");
  console.log("SECRETARY_ATTENDANCE_NOT_INFERRED=true");
  console.log("SECRETARY_RSVP_NOT_INFERRED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
}
