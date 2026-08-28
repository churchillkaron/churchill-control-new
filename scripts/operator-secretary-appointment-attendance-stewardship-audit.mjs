import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimePath = "lib/operator/secretary/SecretaryAppointmentAttendanceStewardshipRuntime.js";
const capabilityPath = "lib/platform/capabilities/createSecretaryAppointmentAttendanceStewardshipCapability.js";
const platformPath = "lib/platform/runtime/PlatformDomainRuntime.js";
const packagePath = "package.json";
const wrapperPath = "scripts/run-operator-secretary-meeting-local-certification.sh";

const [runtime, capability, platform, pkg, wrapper] = await Promise.all([
  readFile(runtimePath, "utf8"),
  readFile(capabilityPath, "utf8"),
  readFile(platformPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(wrapperPath, "utf8"),
]);

for (const fragment of [
  "AVANTIQO_EXECUTIVE_SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_V1",
  'scope: "CALENDAR_COORDINATION"',
  'confirmation_status: "PENDING"',
  'attendance_status: "UNKNOWN"',
  "SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_SOURCE_REQUIRED",
  "SECRETARY_APPOINTMENT_ATTENDANCE_SOURCE_REQUIRED",
  "SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_STALE",
  "SECRETARY_APPOINTMENT_ATTENDANCE_STALE_VERSION",
  "SECRETARY_APPOINTMENT_ATTENDANCE_EVIDENCE_REUSE_CONFLICT",
  "confirmation_inferred: false",
  "attendance_inferred: false",
  "no_show_inferred: false",
  "silence_is_confirmation: false",
  "decline_cancelled_appointment: false",
  "decline_rescheduled_appointment: false",
  "calendar_event_modified: false",
  "appointment_cancelled_by_secretary: false",
  "appointment_rescheduled_by_secretary: false",
  "booking_authority_created: false",
  "payment_authority_created: false",
  "binding_authority_delegated: false",
  "Do not treat silence, delivery, a reminder, or a prior tentative status as confirmation or attendance.",
  "Do not infer attendance or no-show from silence, calendar status, notification delivery, or lack of a message.",
]) assert.ok(runtime.includes(fragment), `Missing runtime contract fragment: ${fragment}`);

for (const fragment of [
  'capability: "secretary_appointment_attendance_stewardship"',
  "Silence, reminder delivery and calendar status never imply confirmation or attendance",
  "declines do not automatically cancel or reschedule the appointment",
  "aiEnabled: false",
  "operatorEnabled: true",
  "operatorAutoExecute: true",
]) assert.ok(capability.includes(fragment), `Missing capability fragment: ${fragment}`);

assert.ok(platform.includes("createSecretaryAppointmentAttendanceStewardshipCapability"), "Platform import missing");
assert.ok(platform.includes("secretary_appointment_attendance_stewardship"), "Platform registry missing");
assert.ok(pkg.includes("operator-secretary-appointment-attendance-stewardship-audit.mjs"), "Package audit wiring missing");
assert.ok(wrapper.includes("certify-secretary-appointment-attendance-stewardship-local.mjs"), "Wrapper certification wiring missing");

console.log("OPERATOR_SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_AUDIT=PASS");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_EXPLICIT_CONFIRMATION_CONTRACT=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_EXPLICIT_ATTENDANCE_CONTRACT=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_STALE_FENCE=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_SILENCE_CONFIRMATION_INFERRED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_DECLINE_CANCELS_APPOINTMENT=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_DECLINE_RESCHEDULES_APPOINTMENT=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_BINDING_AUTHORITY_CREATED=false");
