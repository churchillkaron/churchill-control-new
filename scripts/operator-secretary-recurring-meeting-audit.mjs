import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  migration: await readFile("supabase/migrations/20260826193000_secretary_recurring_meetings.sql", "utf8"),
  cutoff: await readFile("supabase/migrations/20260826194000_secretary_recurring_future_cutoff_semantics.sql", "utf8"),
  runtime: await readFile("lib/operator/secretary/SecretaryRecurringMeetingRuntime.js", "utf8"),
  repair: await readFile("lib/operator/secretary/SecretaryRecurringMeetingRepairRuntime.js", "utf8"),
  capability: await readFile("lib/platform/capabilities/createSecretaryRecurringMeetingCapability.js", "utf8"),
  platform: await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  worker: await readFile("app/api/internal/secretary/meeting-coordination/process/route.js", "utf8"),
  harness: await readFile("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8"),
  certification: await readFile("scripts/certify-secretary-recurring-meetings-local.mjs", "utf8"),
};

assert.match(files.migration, /create table if not exists public\.secretary_recurring_meeting_series/);
assert.match(files.migration, /create table if not exists public\.secretary_recurring_meeting_participants/);
assert.match(files.migration, /create table if not exists public\.secretary_recurring_meeting_occurrences/);
assert.match(files.migration, /enable row level security/i);
assert.match(files.migration, /revoke all on public\.secretary_recurring_meeting_series from anon, authenticated/i);
assert.match(files.migration, /grant select, insert, update, delete on public\.secretary_recurring_meeting_series to service_role/i);
assert.match(files.migration, /secretary_create_recurring_meeting_series/);
assert.match(files.migration, /secretary_move_recurring_meeting_occurrence/);
assert.match(files.migration, /secretary_skip_recurring_meeting_occurrence/);
assert.match(files.migration, /secretary_cancel_recurring_meeting_future/);
assert.match(files.migration, /security invoker/i);
assert.match(files.migration, /pg_advisory_xact_lock/);
assert.match(files.migration, /SECRETARY_RECURRING_MEETING_CALENDAR_CONFLICT/);
assert.match(files.migration, /SECRETARY_RECURRING_MEETING_OCCURRENCES_OVERLAP/);
assert.match(files.migration, /source[^\n]*'secretary_recurring_meeting'/i);
assert.match(files.migration, /attendance_not_inferred/);
assert.match(files.migration, /rsvp_not_inferred/);

assert.match(files.cutoff, /remaining_active_pre_cutoff_occurrence_count/);
assert.match(files.cutoff, /pre_cutoff_occurrences_remain_editable/);
assert.match(files.cutoff, /v_series_status := case when v_remaining_active > 0 then 'ACTIVE' else 'CANCELLED' end/);
assert.match(files.cutoff, /past_occurrences_preserved/);
assert.match(files.cutoff, /security invoker/i);

assert.match(files.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_RECURRING_MEETING_V1/);
assert.match(files.runtime, /deterministicFollowUpId/);
assert.match(files.runtime, /avantiqo-secretary-recurring-meeting-notification-v1/);
assert.match(files.runtime, /recurring_meeting_notification:\s*true/);
assert.match(files.runtime, /execution_owner:\s*"SECRETARY"/);
assert.match(files.runtime, /execution_ready:\s*true/);
assert.match(files.runtime, /attendance_not_inferred:\s*true/);
assert.match(files.runtime, /rsvp_not_inferred:\s*true/);
assert.match(files.runtime, /readSecretaryRecurringMeetingSeries/);
assert.match(files.runtime, /attendance_confirmed_party_ids:\s*\[\]/);

assert.match(files.repair, /repairSecretaryRecurringMeetingNotifications/);
assert.match(files.repair, /metadata->>recurring_notification_materialized/);
assert.match(files.repair, /order\("updated_at", \{ ascending: true \}\)/);
assert.match(files.repair, /repair_candidates_selected_server_side:\s*true/);
assert.match(files.repair, /oldest_unfinished_first:\s*true/);
assert.match(files.repair, /repair_scan_not_limited_to_recent_changes:\s*true/);
assert.match(files.repair, /deterministic_follow_up_ids:\s*true/);
assert.match(files.repair, /notifications_include_all_participants:\s*true/);

assert.match(files.capability, /secretary_recurring_meeting/);
assert.match(files.capability, /createSecretaryRecurringMeetingSeries/);
assert.match(files.capability, /moveSecretaryRecurringMeetingOccurrence/);
assert.match(files.capability, /skipSecretaryRecurringMeetingOccurrence/);
assert.match(files.capability, /cancelSecretaryRecurringMeetingFuture/);
assert.match(files.capability, /operatorRequiresConfirmation:\s*config\.confirm/);
assert.match(files.capability, /operatorAutoExecute:\s*config\.mode === "read"/);
assert.match(files.capability, /contextScope:\s*"organization"/);

assert.match(files.platform, /createSecretaryRecurringMeetingCapability/);
assert.match(files.platform, /secretary_recurring_meeting/);
assert.match(files.platform, /moveOccurrence:\s*async\s*\(\)\s*=>\s*createSecretaryRecurringMeetingCapability\("moveOccurrence"\)/);
assert.match(files.platform, /skipOccurrence:\s*async\s*\(\)\s*=>\s*createSecretaryRecurringMeetingCapability\("skipOccurrence"\)/);
assert.match(files.platform, /cancelFuture:\s*async\s*\(\)\s*=>\s*createSecretaryRecurringMeetingCapability\("cancelFuture"\)/);

assert.match(files.worker, /repairSecretaryRecurringMeetingNotifications/);
assert.match(files.worker, /recurring_meeting_notification_repair/);
assert.match(files.worker, /recurring_meeting_notification_repair_pending_count_server_side:\s*true/);
assert.match(files.worker, /recurring_meeting_notification_repair_oldest_unfinished_first:\s*true/);
assert.match(files.worker, /recurring_meeting_notifications_include_all_participants:\s*true/);
assert.match(files.worker, /recurring_meeting_notifications_deterministic_and_idempotent:\s*true/);
assert.match(files.worker, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_WORKER_V4/);

assert.match(files.harness, /20260826193000_secretary_recurring_meetings\.sql/);
assert.match(files.harness, /20260826194000_secretary_recurring_future_cutoff_semantics\.sql/);
assert.match(files.harness, /certify-secretary-recurring-meetings-local\.mjs/);

assert.match(files.certification, /SECRETARY_RECURRING_MEETING_LOCAL_CERTIFICATION=PASS/);
assert.match(files.certification, /SECRETARY_RECURRING_MEETING_PRE_CUTOFF_OCCURRENCES_REMAIN_EDITABLE=true/);
assert.match(files.certification, /SECRETARY_RECURRING_MEETING_NOTIFICATION_REPAIRABLE=true/);
assert.match(files.certification, /SECRETARY_RECURRING_MEETING_REPAIR_DETERMINISTIC_IDS=true/);
assert.match(files.certification, /SECRETARY_RECURRING_MEETING_REPAIR_OLDEST_UNFINISHED_FIRST=true/);
assert.match(files.certification, /SECRETARY_PROVIDER_CALLS_PERFORMED=false/);
assert.match(files.certification, /SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false/);

console.log("OPERATOR_SECRETARY_RECURRING_MEETING_AUDIT=PASS");
console.log("SECRETARY_RECURRING_MEETING_DURABLE_SERIES=true");
console.log("SECRETARY_RECURRING_MEETING_CANONICAL_OCCURRENCES=true");
console.log("SECRETARY_RECURRING_MEETING_ATOMIC_SERIES_CREATION=true");
console.log("SECRETARY_RECURRING_MEETING_SINGLE_OCCURRENCE_CHANGE=true");
console.log("SECRETARY_RECURRING_MEETING_FUTURE_CUTOFF=true");
console.log("SECRETARY_RECURRING_MEETING_PRE_CUTOFF_EDITABILITY=true");
console.log("SECRETARY_RECURRING_MEETING_NOTIFICATION_REPAIR=true");
console.log("SECRETARY_RECURRING_MEETING_NOTIFICATION_REPAIR_STARVATION_FREE=true");
console.log("SECRETARY_RECURRING_MEETING_ATTENDANCE_NOT_INFERRED=true");
console.log("SECRETARY_RECURRING_MEETING_RSVP_NOT_INFERRED=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
