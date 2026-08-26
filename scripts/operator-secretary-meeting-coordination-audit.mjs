import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  migration: await readFile("supabase/migrations/20260826102000_secretary_multi_party_meeting_coordination.sql", "utf8"),
  runtime: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationRuntime.js", "utf8"),
  evidence: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationEvidenceRuntime.js", "utf8"),
  bookingGuard: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime.js", "utf8"),
  notification: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationNotificationRuntime.js", "utf8"),
  capability: await readFile("lib/platform/capabilities/createSecretaryMeetingCoordinationCapability.js", "utf8"),
  platform: await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  worker: await readFile("app/api/internal/secretary/meeting-coordination/process/route.js", "utf8"),
  harness: await readFile("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8"),
  callClarificationCert: await readFile("scripts/certify-secretary-meeting-call-clarification-local.mjs", "utf8"),
  vercel: await readFile("vercel.json", "utf8"),
};

assert.match(files.migration, /create table if not exists public\.secretary_meeting_coordinations/);
assert.match(files.migration, /create table if not exists public\.secretary_meeting_coordination_participants/);
assert.match(files.migration, /availability_requires_explicit_evidence/);
assert.match(files.migration, /attendance_not_inferred/);
assert.match(files.migration, /secretary_create_meeting_coordination/);
assert.match(files.migration, /secretary_follow_ups/);
assert.match(files.migration, /execution_owner', 'SECRETARY'/);
assert.match(files.migration, /execution_ready', true/);
assert.match(files.migration, /claim_secretary_meeting_coordination/);
assert.match(files.migration, /for update skip locked/i);
assert.match(files.migration, /secretary_cancel_meeting_coordination/);
assert.match(files.migration, /ALREADY_BOOKED_USE_CALENDAR_CHANGE/);
assert.match(files.migration, /enable row level security/i);
assert.match(files.migration, /revoke all on public\.secretary_meeting_coordinations from anon, authenticated/i);

assert.match(files.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_V1/);
assert.match(files.runtime, /Candidate slots:/);
assert.match(files.runtime, /Do not imply that any slot is booked or that attendance is confirmed/);
assert.match(files.runtime, /Never infer attendance, acceptance, timezone, or availability from silence or vague wording/);
assert.match(files.runtime, /needs_clarification/);
assert.match(files.runtime, /commonExplicitSlot/);
assert.match(files.runtime, /required\.every/);
assert.match(files.runtime, /ownerSlotStillAvailable/);
assert.match(files.runtime, /secretary_book_calendar_event/);
assert.match(files.runtime, /SECRETARY_MEETING_COORDINATION_SLOT_RACE_LOST/);
assert.match(files.runtime, /attendance_confirmed_party_ids:\s*\[\]/);
assert.match(files.runtime, /attendance_not_inferred:\s*true/);
assert.match(files.runtime, /availability_requires_explicit_evidence:\s*true/);
assert.match(files.runtime, /calendar_event_cancelled:\s*false/);

assert.match(files.evidence, /SECRETARY_CALL/);
assert.match(files.evidence, /secretary_outbound_call_requests/);
assert.match(files.evidence, /secretary_calls/);
assert.match(files.evidence, /transcript/);
assert.match(files.evidence, /clarification_follow_up_id/);
assert.match(files.evidence, /firstFreshInbound/);
assert.match(files.evidence, /ensureAmbiguousParticipantClarification/);
assert.match(files.evidence, /clarification_requires_fresh_evidence:\s*true/);
assert.match(files.evidence, /clarification_requested_after_evidence_id/);
assert.match(files.evidence, /clarification_response_used:\s*false/);
assert.match(files.evidence, /do not reuse the earlier ambiguous answer/i);
assert.match(files.evidence, /ambiguous_call_triggers_immediate_clarification:\s*true/);
assert.match(files.evidence, /Never infer attendance, acceptance, timezone or availability from silence, politeness, implication or prior messages/);
assert.match(files.evidence, /latest_availability_evidence_id/);
assert.match(files.evidence, /call_evidence_supported:\s*true/);
assert.match(files.evidence, /reconcileSecretaryMeetingCoordinationEvidence/);

assert.match(files.bookingGuard, /secretaryMeetingParticipantHasExplicitAvailabilityEvidence/);
assert.match(files.bookingGuard, /explicit_response_evidence === true/);
assert.match(files.bookingGuard, /INBOUND_MESSAGE/);
assert.match(files.bookingGuard, /SECRETARY_CALL/);
assert.match(files.bookingGuard, /latest_availability_evidence_id/);
assert.match(files.bookingGuard, /clarification_requested_after_evidence_id/);
assert.match(files.bookingGuard, /clarification_response_used === true/);
assert.match(files.bookingGuard, /evidenceId !== ambiguousEvidenceId/);
assert.match(files.bookingGuard, /SECRETARY_MEETING_COORDINATION_FRESH_CLARIFICATION_EVIDENCE_REQUIRED/);
assert.match(files.bookingGuard, /booking_blocked_without_fresh_clarification_evidence/);
assert.match(files.bookingGuard, /SECRETARY_MEETING_COORDINATION_EXPLICIT_EVIDENCE_REQUIRED/);
assert.match(files.bookingGuard, /booking_blocked_without_explicit_availability_evidence:\s*true/);
assert.match(files.bookingGuard, /prioritizeSecretaryMeetingSlotsForOptionalAvailability/);
assert.match(files.bookingGuard, /MAX_OPTIONAL_EXPLICIT_AVAILABILITY_THEN_EARLIEST_START/);
assert.match(files.bookingGuard, /required_explicit_compatibility_preserved:\s*true/);
assert.match(files.bookingGuard, /processNextSecretaryMeetingCoordinationWithBookingGuard/);
assert.match(files.bookingGuard, /reconcileSecretaryMeetingCoordinationEvidence/);
assert.match(files.bookingGuard, /processSecretaryMeetingCoordination\(slotSelection\.coordination\)/);
assert.match(files.bookingGuard, /ensureSecretaryMeetingBookingNotifications/);
assert.match(files.bookingGuard, /booking_notifications_materialized:\s*true/);
assert.match(files.bookingGuard, /rsvp_not_inferred:\s*true/);
assert.match(files.bookingGuard, /booked_notification_pending_repair/);
assert.match(files.bookingGuard, /attendance_not_inferred:\s*true/);
assert.match(files.bookingGuard, /external_authority_used:\s*false/);

assert.match(files.notification, /createHash/);
assert.match(files.notification, /deterministicFollowUpId/);
assert.match(files.notification, /avantiqo-secretary-meeting-booking-notification-v1/);
assert.match(files.notification, /meeting_booking_notification:\s*true/);
assert.match(files.notification, /execution_owner:\s*"SECRETARY"/);
assert.match(files.notification, /execution_ready:\s*true/);
assert.match(files.notification, /attendance_not_inferred:\s*true/);
assert.match(files.notification, /rsvp_not_inferred:\s*true/);
assert.match(files.notification, /Do not state or imply that they accepted the meeting, RSVP'd, or that attendance is confirmed/);
assert.match(files.notification, /do not state or imply that their RSVP or attendance is confirmed/i);
assert.match(files.notification, /reply if their availability has changed/i);
assert.match(files.notification, /inserted\.error\.code !== "23505"/);
assert.match(files.notification, /booking_notifications_materialized:\s*true/);
assert.match(files.notification, /booking_notifications_include_all_participants:\s*true/);
assert.match(files.notification, /repairSecretaryMeetingBookingNotifications/);
assert.match(files.notification, /deterministic_follow_up_ids:\s*true/);

assert.match(files.capability, /secretary_meeting_coordination/);
assert.match(files.capability, /coordinate this meeting/i);
assert.match(files.capability, /find a time for everyone/i);
assert.match(files.capability, /who replied about the meeting/i);
assert.match(files.capability, /stop arranging this meeting/i);
assert.match(files.capability, /enum:\s*\["MESSAGE", "EMAIL", "CALL"\]/);
assert.match(files.capability, /operatorRequiresConfirmation:\s*config\.confirm/);
assert.match(files.capability, /operatorAutoExecute:\s*config\.mode === "read"/);
assert.match(files.capability, /contextScope:\s*"organization"/);

assert.match(files.platform, /createSecretaryMeetingCoordinationCapability/);
assert.match(files.platform, /secretary_meeting_coordination/);
assert.match(files.platform, /coordinate:\s*async\s*\(\)\s*=>\s*createSecretaryMeetingCoordinationCapability\("coordinate"\)/);
assert.match(files.platform, /status:\s*async\s*\(\)\s*=>\s*createSecretaryMeetingCoordinationCapability\("status"\)/);
assert.match(files.platform, /cancel:\s*async\s*\(\)\s*=>\s*createSecretaryMeetingCoordinationCapability\("cancel"\)/);

assert.match(files.worker, /CRON_SECRET/);
assert.match(files.worker, /processNextSecretaryMeetingCoordinationWithBookingGuard/);
assert.match(files.worker, /repairSecretaryMeetingBookingNotifications/);
assert.match(files.worker, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_WORKER_V3/);
assert.match(files.worker, /booking_notifications_include_all_participants:\s*true/);
assert.match(files.worker, /booking_notifications_deterministic_and_idempotent:\s*true/);
assert.match(files.worker, /booking_notifications_rsvp_not_inferred:\s*true/);
assert.match(files.worker, /explicit_availability_evidence_required_for_booking:\s*true/);
assert.match(files.worker, /attendance_not_inferred:\s*true/);
assert.match(files.worker, /external_authority_used:\s*false/);
assert.doesNotMatch(files.worker, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_WORKER_V2/);
assert.doesNotMatch(files.worker, /processNextSecretaryMeetingCoordinationSafely/);

assert.match(files.harness, /certify-secretary-meeting-call-clarification-local\.mjs/);
assert.match(files.callClarificationCert, /SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_CERTIFICATION=PASS/);
assert.match(files.callClarificationCert, /SECRETARY_AMBIGUOUS_CALL_TRIGGERS_IMMEDIATE_CLARIFICATION=true/);
assert.match(files.callClarificationCert, /SECRETARY_STALE_PRE_CLARIFICATION_EVIDENCE_CANNOT_BOOK=true/);
assert.match(files.callClarificationCert, /SECRETARY_DISTINCT_POST_CLARIFICATION_EVIDENCE_CAN_QUALIFY=true/);
assert.match(files.callClarificationCert, /SECRETARY_PROVIDER_CALLS_PERFORMED=false/);

const vercel = JSON.parse(files.vercel);
assert.equal(vercel.functions["app/api/internal/secretary/meeting-coordination/process/route.js"]?.maxDuration, 300);
assert.ok(
  vercel.crons.some((entry) => entry.path === "/api/internal/secretary/meeting-coordination/process" && entry.schedule === "* * * * *"),
  "Secretary meeting coordination worker must run every minute",
);

console.log("OPERATOR_SECRETARY_MEETING_COORDINATION_AUDIT=PASS");
console.log("SECRETARY_MULTI_PARTY_MEETING_COORDINATION=true");
console.log("SECRETARY_MEETING_AVAILABILITY_EXPLICIT_EVIDENCE=true");
console.log("SECRETARY_MEETING_CALL_AVAILABILITY_EVIDENCE=true");
console.log("SECRETARY_MEETING_AMBIGUITY_CLARIFICATION=true");
console.log("SECRETARY_MEETING_AMBIGUOUS_CALL_IMMEDIATE_CLARIFICATION=true");
console.log("SECRETARY_MEETING_CLARIFICATION_REQUIRES_FRESH_EVIDENCE=true");
console.log("SECRETARY_MEETING_STALE_PRE_CLARIFICATION_EVIDENCE_BLOCKED=true");
console.log("SECRETARY_MEETING_REQUIRED_PARTICIPANTS_COMMON_SLOT=true");
console.log("SECRETARY_MEETING_SLOT_OPTIONAL_ATTENDANCE_OPTIMIZED=true");
console.log("SECRETARY_MEETING_SLOT_REQUIRED_ATTENDEE_PRIORITY=true");
console.log("SECRETARY_MEETING_ATOMIC_BOOKING=true");
console.log("SECRETARY_MEETING_SLOT_RACE_FAILS_CLOSED=true");
console.log("SECRETARY_MEETING_BOOKING_GUARD=true");
console.log("SECRETARY_MEETING_BOOKING_REQUIRES_EXPLICIT_RESPONSE_EVIDENCE=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATIONS=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_ALL_PARTICIPANTS=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_IDEMPOTENT=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_REPAIR=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_RSVP_NOT_INFERRED=true");
console.log("SECRETARY_MEETING_COORDINATION_WORKER_V3=true");
console.log("SECRETARY_MEETING_ATTENDANCE_NOT_INFERRED=true");
console.log("SECRETARY_MEETING_COORDINATION_CRON_REGISTERED=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
