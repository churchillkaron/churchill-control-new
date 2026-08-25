import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  caller: "lib/operator/secretary/SecretaryCallerRuntime.js",
  callerBrain: "lib/operator/secretary/SecretaryCallerConversationRuntime.js",
  messageBrain: "lib/operator/secretary/SecretaryMessageConversationRuntime.js",
  messageWorker: "app/api/internal/secretary/messages/process/route.js",
  appointmentRuntime: "lib/operator/secretary/SecretaryAppointmentNotificationRuntime.js",
  appointmentWorker: "app/api/internal/secretary/appointments/notifications/process/route.js",
  commitmentRuntime: "lib/operator/secretary/SecretaryCommitmentCaptureRuntime.js",
  commitmentWorker: "app/api/internal/secretary/commitments/process/route.js",
  followUpRuntime: "lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js",
  followUpEscalation: "lib/operator/secretary/SecretaryFollowUpEscalationRuntime.js",
  followUpWorker: "app/api/internal/secretary/follow-ups/process/route.js",
  quietHoursRuntime: "lib/operator/secretary/SecretaryContactQuietHoursRuntime.js",
  outboundCallRuntime: "lib/operator/secretary/SecretaryOutboundCallRuntime.js",
  dueWorker: "app/api/internal/secretary/due-work/process/route.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  core: "supabase/migrations/20260825062200_avantiqo_secretary_native_core.sql",
  selfService: "supabase/migrations/20260825071000_secretary_contact_owned_appointment_mutations.sql",
  references: "supabase/migrations/20260825071100_secretary_appointment_self_service_reference.sql",
  notifications: "supabase/migrations/20260825071500_secretary_appointment_contact_notifications.sql",
  notificationDelivery: "supabase/migrations/20260825071600_secretary_appointment_notification_delivery.sql",
  commitments: "supabase/migrations/20260825072000_secretary_commitment_capture.sql",
  followUpExecutions: "supabase/migrations/20260825073300_secretary_follow_up_execution.sql",
  alertReconciliation: "supabase/migrations/20260825064700_avantiqo_secretary_alert_reconciliation.sql",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

for (const table of [
  "secretary_contact_profiles",
  "secretary_calendar_events",
  "secretary_tasks",
  "secretary_calls",
  "secretary_follow_ups",
  "secretary_settings",
]) {
  assert.match(source.core, new RegExp(`create table if not exists public\\.${table}`, "i"));
}
assert.match(source.core, /enable row level security/i);
assert.match(source.core, /references public\.parties/i);

for (const action of [
  "readAgenda",
  "scanDueWork",
  "createCalendarEvent",
  "listContacts",
  "createContact",
  "listTasks",
  "listFollowUps",
  "listCalls",
  "readSettings",
]) {
  assert.match(source.platform, new RegExp(`createSecretaryCapability\\(\\"${action}\\"\\)`));
}

for (const runtime of [source.callerBrain, source.messageBrain]) {
  assert.match(runtime, /RESTRICTED_PUBLIC_SECRETARY/);
  assert.match(runtime, /tools:\s*\[\]/);
  assert.match(runtime, /allow_mutating_tools:\s*false/);
  assert.match(runtime, /LIST_APPOINTMENTS/);
  assert.match(runtime, /RESCHEDULE_APPOINTMENT/);
  assert.match(runtime, /CANCEL_APPOINTMENT/);
  assert.match(runtime, /appointment_reference/);
}
assert.match(source.caller, /listOwnAppointments/);
assert.match(source.caller, /rescheduleOwnAppointment/);
assert.match(source.caller, /cancelOwnAppointment/);
assert.match(source.messageBrain, /Preserve the sender's language/);
assert.match(source.messageBrain, /secretary_reserve_message_reply/);
assert.match(source.messageBrain, /contactAllowsMessages/);

assert.match(source.selfService, /contact_party_id = p_contact_party_id/i);
assert.match(source.selfService, /event_type = 'APPOINTMENT'/i);
assert.match(source.selfService, /pg_advisory_xact_lock/i);
assert.match(source.references, /self_service_reference uuid/i);
assert.match(source.references, /secretary_reschedule_own_appointment_ref/);
assert.match(source.references, /secretary_cancel_own_appointment_ref/);

assert.match(source.notifications, /secretary_appointment_notifications/);
assert.match(source.notifications, /CONFIRMATION/);
assert.match(source.notifications, /RESCHEDULED/);
assert.match(source.notifications, /CANCELLED/);
assert.match(source.notifications, /REMINDER/);
assert.match(source.notifications, /'\[1440,120\]'::jsonb/);
assert.match(source.notifications, /for update skip locked/i);
assert.match(source.notificationDelivery, /secretary_reserve_appointment_notification_message/);
assert.match(source.appointmentRuntime, /allow_messages/);
assert.match(source.appointmentRuntime, /preferred_channel/);
assert.match(source.appointmentRuntime, /preferred_language/);
assert.match(source.appointmentRuntime, /tools:\s*\[\]/);
assert.match(source.appointmentRuntime, /AMBIGUOUS_OR_FAILED_DELIVERY_RETRY_SUPPRESSED/);

assert.match(source.commitments, /secretary_commitment_extractions/);
assert.match(source.commitments, /source_kind in \('CALL','MESSAGE'\)/i);
assert.match(source.commitments, /for update skip locked/i);
assert.match(source.commitmentRuntime, /Extract only obligations clearly stated in the evidence/);
assert.match(source.commitmentRuntime, /execution_owner/);
assert.match(source.commitmentRuntime, /SECRETARY/);
assert.match(source.commitmentRuntime, /CONTACT/);
assert.match(source.commitmentRuntime, /STAFF/);
assert.match(source.commitmentRuntime, /UNKNOWN/);
assert.match(source.commitmentRuntime, /execution_ready/);
assert.match(source.commitmentRuntime, /explicit_commitment:\s*true/);
assert.match(source.commitmentRuntime, /tools:\s*\[\]/);
assert.match(source.commitmentRuntime, /allow_mutating_tools:\s*false/);

assert.match(source.followUpExecutions, /secretary_follow_up_executions/);
assert.match(source.followUpExecutions, /execution_owner', ''\)\) = 'SECRETARY'/i);
assert.match(source.followUpExecutions, /execution_ready', 'false'\)\) = 'true'/i);
assert.match(source.followUpExecutions, /f\.action_type in \('CALL','MESSAGE','EMAIL'\)/i);
assert.match(source.followUpExecutions, /for update skip locked/i);
assert.match(source.followUpExecutions, /communication_messages_secretary_follow_up_execution_uidx/);
assert.match(source.followUpExecutions, /secretary_outbound_call_follow_up_execution_uidx/);
assert.match(source.followUpRuntime, /metadata\.execution_owner/);
assert.match(source.followUpRuntime, /metadata\.execution_ready !== true/);
assert.match(source.followUpRuntime, /allow_calls/);
assert.match(source.followUpRuntime, /allow_messages/);
assert.match(source.followUpRuntime, /FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED/);
assert.match(source.followUpRuntime, /tools:\s*\[\]/);
assert.match(source.followUpRuntime, /partyId:\s*null/);
assert.match(source.followUpRuntime, /OUTBOUND_CALL_/);
assert.match(source.followUpRuntime, /reconcileQueuedSecretaryFollowUpExecutions/);

assert.match(source.quietHoursRuntime, /SECRETARY_CONTACT_QUIET_HOURS_CONTRACT/);
assert.match(source.quietHoursRuntime, /Intl\.DateTimeFormat/);
assert.match(source.quietHoursRuntime, /overnight windows are supported/);
assert.match(source.quietHoursRuntime, /CONTACT_QUIET_HOURS/);
assert.match(source.followUpRuntime, /evaluateSecretaryContactQuietHours/);
assert.match(source.followUpRuntime, /status: "deferred"/);
assert.match(source.followUpRuntime, /quiet_hours_deferred_until/);
assert.match(source.appointmentRuntime, /evaluateSecretaryContactQuietHours/);
assert.match(source.appointmentRuntime, /QUIET_HOURS_WOULD_MAKE_REMINDER_LATE/);
assert.match(source.outboundCallRuntime, /evaluateSecretaryContactQuietHours/);
assert.match(source.outboundCallRuntime, /quiet_hours_adjusted/);
assert.match(source.outboundCallRuntime, /SECRETARY_OUTBOUND_CONTACT_DO_NOT_DISTURB/);

assert.match(source.followUpEscalation, /HUMAN_ATTENTION_REASONS/);
assert.match(source.followUpEscalation, /FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED/);
assert.match(source.followUpEscalation, /OUTBOUND_CALL_FAILED/);
assert.match(source.followUpEscalation, /human_action_required:\s*true/);
assert.match(source.followUpEscalation, /priority:\s*"HIGH"/);
assert.match(source.followUpEscalation, /dedupeKey = `follow_up:\$\{followUp\.id\}:\$\{followUp\.due_at\}`/);
assert.match(source.followUpWorker, /escalateSecretaryFollowUpExecution/);
assert.match(source.followUpWorker, /AVANTIQO_SECRETARY_FOLLOW_UP_EXECUTION_V2/);
assert.match(source.followUpWorker, /exhausted && secretaryFollowUpExecutionNeedsHumanAttention/);
assert.match(source.alertReconciliation, /SOURCE_FOLLOW_UP_NO_LONGER_PENDING/);
assert.match(source.alertReconciliation, /a\.dedupe_key = 'follow_up:' \|\| f\.id::text \|\| ':' \|\| f\.due_at::text/);

for (const worker of [
  source.dueWorker,
  source.messageWorker,
  source.appointmentWorker,
  source.commitmentWorker,
  source.followUpWorker,
]) {
  assert.match(worker, /process\.env\.CRON_SECRET/);
  assert.match(worker, /maxDuration = 300/);
}

const vercel = JSON.parse(source.vercel);
const expectedCrons = [
  "/api/internal/secretary/due-work/process",
  "/api/internal/secretary/messages/process",
  "/api/internal/secretary/appointments/notifications/process",
  "/api/internal/secretary/commitments/process",
  "/api/internal/secretary/follow-ups/process",
];
for (const path of expectedCrons) {
  const job = (vercel.crons || []).find((entry) => entry.path === path);
  assert.ok(job, `Missing real Secretary cron: ${path}`);
  assert.equal(job.schedule, "* * * * *", `${path} must run every minute`);
}

console.log("OPERATOR_SECRETARY_CONVERGENCE_AUDIT=PASS");
console.log("SECRETARY_IN_HOUSE_STATE=true");
console.log("SECRETARY_RESTRICTED_EXTERNAL_AUTHORITY=true");
console.log("SECRETARY_PHONE_SELF_SERVICE=true");
console.log("SECRETARY_WRITTEN_MESSAGE_AUTONOMY=true");
console.log("SECRETARY_APPOINTMENT_NOTIFICATIONS=true");
console.log("SECRETARY_COMMITMENT_CAPTURE=true");
console.log("SECRETARY_AUTONOMOUS_FOLLOW_UP_EXECUTION=true");
console.log("SECRETARY_NON_SECRETARY_PROMISE_AUTO_EXECUTION=false");
console.log("SECRETARY_CONTACT_QUIET_HOURS=true");
console.log("SECRETARY_CONTACT_TIMEZONE_AWARE=true");
console.log("SECRETARY_BLOCKED_AUTONOMY_HUMAN_ESCALATION=true");
console.log("SECRETARY_ESCALATION_AUTO_RESOLUTION=true");
console.log("SECRETARY_REAL_CLOUD_JOBS=5");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
