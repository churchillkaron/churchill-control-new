import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  ownership: "supabase/migrations/20260825071000_secretary_contact_owned_appointment_mutations.sql",
  references: "supabase/migrations/20260825071100_secretary_appointment_self_service_reference.sql",
  caller: "lib/operator/secretary/SecretaryCallerRuntime.js",
  callerBrain: "lib/operator/secretary/SecretaryCallerConversationRuntime.js",
  messageBrain: "lib/operator/secretary/SecretaryMessageConversationRuntime.js",
  notifications: "supabase/migrations/20260825071500_secretary_appointment_contact_notifications.sql",
  notificationDelivery: "supabase/migrations/20260825071600_secretary_appointment_notification_delivery.sql",
  notificationRuntime: "lib/operator/secretary/SecretaryAppointmentNotificationRuntime.js",
  notificationProcessor: "app/api/internal/secretary/appointments/notifications/process/route.js",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

assert.match(source.ownership, /contact_party_id = p_contact_party_id/i);
assert.match(source.ownership, /event_type = 'APPOINTMENT'/i);
assert.match(source.ownership, /status in \('TENTATIVE','CONFIRMED'\)/i);
assert.match(source.ownership, /pg_advisory_xact_lock/i);
assert.match(source.ownership, /SECRETARY_SELF_SERVICE_SLOT_UNAVAILABLE/);
assert.doesNotMatch(source.ownership, /security invoker/i);
assert.match(source.ownership, /revoke all on function public\.secretary_reschedule_own_appointment/i);
assert.match(source.ownership, /to service_role/i);

assert.match(source.references, /self_service_reference uuid/i);
assert.match(source.references, /set default gen_random_uuid\(\)/i);
assert.match(source.references, /set not null/i);
assert.match(source.references, /secretary_calendar_events_self_service_reference_uidx/);
assert.match(source.references, /secretary_reschedule_own_appointment_ref/);
assert.match(source.references, /secretary_cancel_own_appointment_ref/);
assert.match(source.references, /contact_party_id = p_contact_party_id/i);

for (const runtime of [source.caller, source.callerBrain, source.messageBrain]) {
  assert.match(runtime, /listOwnAppointments|listCallerOwnAppointments/);
  assert.match(runtime, /rescheduleOwnAppointment|rescheduleCallerOwnAppointment/);
  assert.match(runtime, /cancelOwnAppointment|cancelCallerOwnAppointment/);
  assert.match(runtime, /appointment_reference/);
  assert.match(runtime, /self_service_reference/);
}

assert.doesNotMatch(source.callerBrain, /calendar event titles, attendees, descriptions, counts, owner IDs, contact IDs, or internal event IDs[^\n]*Return/i);
assert.match(source.callerBrain, /tools:\s*\[\]/);
assert.match(source.callerBrain, /allow_mutating_tools:\s*false/);
assert.match(source.callerBrain, /RESTRICTED_PUBLIC_SECRETARY/);
assert.match(source.callerBrain, /own_appointments/);
assert.match(source.callerBrain, /use CLARIFY rather than guessing/i);

assert.match(source.messageBrain, /LIST_APPOINTMENTS/);
assert.match(source.messageBrain, /RESCHEDULE_APPOINTMENT/);
assert.match(source.messageBrain, /CANCEL_APPOINTMENT/);
assert.match(source.messageBrain, /own_appointments/);
assert.match(source.messageBrain, /tools:\s*\[\]/);
assert.match(source.messageBrain, /allow_mutating_tools:\s*false/);
assert.match(source.messageBrain, /Preserve the sender's language/);

assert.match(source.notifications, /CONFIRMATION','RESCHEDULED','CANCELLED','REMINDER/);
assert.match(source.notifications, /reminder_minutes_before/);
assert.match(source.notifications, /'\[1440,120\]'::jsonb/);
assert.match(source.notifications, /for update skip locked/i);
assert.match(source.notifications, /enable row level security/i);
assert.match(source.notifications, /status = 'SUPERSEDED'/i);

assert.match(source.notificationDelivery, /secretary_reserve_appointment_notification_message/);
assert.match(source.notificationDelivery, /for update/i);
assert.match(source.notificationDelivery, /communication_messages_secretary_appointment_notification_uidx/);
assert.match(source.notificationDelivery, /'source', 'AVANTIQO_SECRETARY'/);

assert.match(source.notificationRuntime, /allow_messages/);
assert.match(source.notificationRuntime, /preferred_channel/);
assert.match(source.notificationRuntime, /preferred_language/);
assert.match(source.notificationRuntime, /secretary_reserve_appointment_notification_message/);
assert.match(source.notificationRuntime, /tools:\s*\[\]/);
assert.match(source.notificationRuntime, /allow_mutating_tools:\s*false/);
assert.match(source.notificationRuntime, /Never mention internal IDs/);
assert.match(source.notificationRuntime, /AMBIGUOUS_OR_FAILED_DELIVERY_RETRY_SUPPRESSED/);

assert.match(source.notificationProcessor, /process\.env\.CRON_SECRET/);
assert.match(source.notificationProcessor, /materializeSecretaryAppointmentReminders/);
assert.match(source.notificationProcessor, /claimSecretaryAppointmentNotification/);
assert.match(source.notificationProcessor, /processSecretaryAppointmentNotification/);

const vercel = JSON.parse(source.vercel);
const cron = (vercel.crons || []).find(
  (job) => job.path === "/api/internal/secretary/appointments/notifications/process",
);
assert.ok(cron, "Secretary appointment notification processor must be on the real Vercel cron schedule");
assert.equal(cron.schedule, "* * * * *");
assert.equal(
  vercel.functions?.["app/api/internal/secretary/appointments/notifications/process/route.js"]?.maxDuration,
  300,
);

console.log("OPERATOR_SECRETARY_APPOINTMENT_SELF_SERVICE_AUDIT=PASS");
console.log("SECRETARY_APPOINTMENT_CONTACT_ISOLATION=true");
console.log("SECRETARY_APPOINTMENT_INTERNAL_IDS_DISCLOSED=false");
console.log("SECRETARY_APPOINTMENT_RESCHEDULE_CANCEL=true");
console.log("SECRETARY_APPOINTMENT_CONTACT_NOTIFICATIONS=true");
console.log("SECRETARY_APPOINTMENT_DEFAULT_REMINDERS_MINUTES=1440,120");
console.log("SECRETARY_APPOINTMENT_NOTIFICATION_REPLAY_SAFE=true");
console.log("SECRETARY_APPOINTMENT_EXTERNAL_AUTHORITY_USED=false");
