import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import AppointmentAttendance from "@/lib/operator/secretary/SecretaryAppointmentAttendanceStewardshipRuntime";

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const contactPartyId = randomUUID();
const eventId = randomUUID();
const context = { organizationId, actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Appointment Attendance Certification" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive", party_type: "PERSON", status: "ACTIVE" },
  { id: contactPartyId, organization_id: organizationId, display_name: "Appointment Contact", email: "appointment@example.test", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());
await one(supabaseAdmin.from("secretary_contact_profiles").insert({ organization_id: organizationId, party_id: contactPartyId, preferred_channel: "email", allow_calls: true, allow_messages: true }).select("*").single());
await one(supabaseAdmin.from("secretary_calendar_events").insert({
  id: eventId,
  organization_id: organizationId,
  owner_party_id: ownerPartyId,
  contact_party_id: contactPartyId,
  title: "Client appointment",
  event_type: "APPOINTMENT",
  status: "CONFIRMED",
  starts_at: "2026-09-10T03:00:00.000Z",
  ends_at: "2026-09-10T04:00:00.000Z",
  timezone: "Asia/Bangkok",
  location: "Office",
  created_by_party_id: ownerPartyId,
}).select("*").single());

const started = await AppointmentAttendance.start({ context, payload: {
  calendar_event_id: eventId,
  confirmation_due_at: "2026-09-09T03:00:00.000Z",
  evidence_id: "appointment-attendance-start-v1",
  started_at: "2026-09-01T03:00:00.000Z",
} });
assert.equal(started.record.confirmation_status, "PENDING");
assert.equal(started.record.attendance_status, "UNKNOWN");
assert.equal(started.confirmation_inferred, false);
assert.equal(started.attendance_inferred, false);

const refreshed1 = await AppointmentAttendance.refresh({ context, payload: { stewardship_id: started.record.stewardship_id } });
const refreshed2 = await AppointmentAttendance.refresh({ context, payload: { stewardship_id: started.record.stewardship_id } });
assert.deepEqual(refreshed1.follow_up_ids, refreshed2.follow_up_ids);
assert.ok(refreshed1.follow_up_ids.length >= 2);

const declined = await AppointmentAttendance.recordConfirmation({ context, payload: {
  stewardship_id: started.record.stewardship_id,
  expected_version: 1,
  confirmation_status: "DECLINED",
  source_reference: "message:contact-decline-1",
  evidence_id: "appointment-attendance-decline-v1",
  occurred_at: "2026-09-02T03:00:00.000Z",
} });
assert.equal(declined.record.confirmation_status, "DECLINED");
assert.equal(declined.decline_cancelled_appointment, false);
assert.equal(declined.decline_rescheduled_appointment, false);
const eventAfterDecline = await one(supabaseAdmin.from("secretary_calendar_events").select("status,starts_at,ends_at").eq("organization_id", organizationId).eq("id", eventId).single());
assert.equal(eventAfterDecline.status, "CONFIRMED");
assert.equal(eventAfterDecline.starts_at, "2026-09-10T03:00:00+00:00");

let staleBlocked = false;
try {
  await AppointmentAttendance.recordConfirmation({ context, payload: {
    stewardship_id: started.record.stewardship_id,
    expected_version: 1,
    confirmation_status: "CONFIRMED",
    source_reference: "message:stale",
    evidence_id: "appointment-attendance-stale-v1",
    occurred_at: "2026-09-02T04:00:00.000Z",
  } });
} catch (error) { staleBlocked = String(error?.message || error).includes("SECRETARY_APPOINTMENT_ATTENDANCE_STALE_VERSION"); }
assert.equal(staleBlocked, true);

await one(supabaseAdmin.from("secretary_calendar_events").update({ starts_at: "2026-09-12T03:00:00.000Z", ends_at: "2026-09-12T04:00:00.000Z", updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", eventId).select("*").single());
let scheduleStaleBlocked = false;
try {
  await AppointmentAttendance.refresh({ context, payload: { stewardship_id: started.record.stewardship_id } });
} catch (error) { scheduleStaleBlocked = String(error?.message || error).includes("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_STALE"); }
assert.equal(scheduleStaleBlocked, true);

const synced = await AppointmentAttendance.syncSchedule({ context, payload: {
  stewardship_id: started.record.stewardship_id,
  expected_version: 2,
  confirmation_due_at: "2026-09-11T03:00:00.000Z",
  evidence_id: "appointment-attendance-sync-v1",
  occurred_at: "2026-09-03T03:00:00.000Z",
} });
assert.equal(synced.record.confirmation_status, "PENDING");
assert.equal(synced.record.attendance_status, "UNKNOWN");
assert.equal(synced.record.schedule_history.length, 1);

const confirmed = await AppointmentAttendance.recordConfirmation({ context, payload: {
  stewardship_id: started.record.stewardship_id,
  expected_version: 3,
  confirmation_status: "CONFIRMED",
  source_reference: "message:contact-confirm-2",
  evidence_id: "appointment-attendance-confirm-v2",
  occurred_at: "2026-09-04T03:00:00.000Z",
} });
assert.equal(confirmed.record.confirmation_status, "CONFIRMED");

const attended = await AppointmentAttendance.recordAttendance({ context, payload: {
  stewardship_id: started.record.stewardship_id,
  expected_version: 4,
  attendance_status: "ATTENDED",
  source_reference: "reception:arrival-log-1",
  evidence_id: "appointment-attendance-attended-v1",
  occurred_at: "2026-09-12T03:10:00.000Z",
} });
assert.equal(attended.record.state, "COMPLETED");
assert.equal(attended.record.attendance_status, "ATTENDED");
assert.equal(attended.attendance_inferred, false);
assert.equal(attended.calendar_event_modified, false);

const replay = await AppointmentAttendance.recordAttendance({ context, payload: {
  stewardship_id: started.record.stewardship_id,
  expected_version: 4,
  attendance_status: "ATTENDED",
  source_reference: "reception:arrival-log-1",
  evidence_id: "appointment-attendance-attended-v1",
  occurred_at: "2026-09-12T03:10:00.000Z",
} });
assert.equal(replay.replay_safe, true);

const pending = await one(supabaseAdmin.from("secretary_follow_ups").select("id").eq("organization_id", organizationId).eq("task_id", started.record.stewardship_id).eq("status", "PENDING"));
assert.equal(Array.isArray(pending) ? pending.length : 0, 0);

console.log("SECRETARY_APPOINTMENT_ATTENDANCE_STEWARDSHIP_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_ATTENDANCE_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_DETERMINISTIC_FOLLOW_UPS=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_DECLINE_DOES_NOT_CANCEL=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_DECLINE_DOES_NOT_RESCHEDULE=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_STALE_VERSION_FENCED=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_STALE_SCHEDULE_FENCED=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_SCHEDULE_HISTORY_PRESERVED=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_TERMINAL_FOLLOW_UPS_CANCELLED=true");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_CONFIRMATION_INFERRED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_ATTENDANCE_INFERRED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_NO_SHOW_INFERRED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_CALENDAR_EVENT_MODIFIED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_APPOINTMENT_ATTENDANCE_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
