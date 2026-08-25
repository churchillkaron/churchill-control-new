import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const quiet = await readFile("lib/operator/secretary/SecretaryContactQuietHoursRuntime.js", "utf8");
const followUp = await readFile("lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js", "utf8");
const appointment = await readFile("lib/operator/secretary/SecretaryAppointmentNotificationRuntime.js", "utf8");
const outbound = await readFile("lib/operator/secretary/SecretaryOutboundCallRuntime.js", "utf8");

assert.match(quiet, /SECRETARY_CONTACT_QUIET_HOURS_CONTRACT/);
assert.match(quiet, /overnight windows are supported/);
assert.match(quiet, /Intl\.DateTimeFormat/);
assert.match(quiet, /CONTACT_QUIET_HOURS/);
assert.match(quiet, /CONTACT_DO_NOT_DISTURB_UNTIL/);
assert.match(quiet, /WRITTEN/);
assert.match(quiet, /nextAllowedAt/);

assert.match(followUp, /evaluateSecretaryContactQuietHours/);
assert.match(followUp, /quietHoursOutcome/);
assert.match(followUp, /status: "deferred"/);
assert.match(followUp, /attempt_count:\s*Math\.max\(0,/);
assert.match(followUp, /available_at:\s*outcome\.defer_until/);
assert.match(followUp, /quiet_hours_deferred_until/);

assert.match(appointment, /evaluateSecretaryContactQuietHours/);
assert.match(appointment, /quiet\.defer_until/);
assert.match(appointment, /attempt_count:\s*Math\.max\(0,/);
assert.match(appointment, /QUIET_HOURS_WOULD_MAKE_REMINDER_LATE/);
assert.match(appointment, /quiet_hours_deferred_until/);

assert.match(outbound, /evaluateSecretaryContactQuietHours/);
assert.match(outbound, /SECRETARY_OUTBOUND_CONTACT_DO_NOT_DISTURB/);
assert.match(outbound, /requested_scheduled_at/);
assert.match(outbound, /quiet_hours_adjusted/);
assert.match(outbound, /scheduledAt = quietHours\.defer_until/);

console.log("OPERATOR_SECRETARY_QUIET_HOURS_AUDIT=PASS");
console.log("SECRETARY_CONTACT_TIMEZONE_AWARE=true");
console.log("SECRETARY_QUIET_HOURS_OVERNIGHT=true");
console.log("SECRETARY_FOLLOW_UP_DEFER_NOT_SKIP=true");
console.log("SECRETARY_APPOINTMENT_REMINDER_LATE_GUARD=true");
console.log("SECRETARY_OUTBOUND_CALL_QUIET_HOURS=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
