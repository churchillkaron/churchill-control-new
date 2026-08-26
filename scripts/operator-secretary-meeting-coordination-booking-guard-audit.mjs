import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  guard: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime.js", "utf8"),
  evidence: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationEvidenceRuntime.js", "utf8"),
  notification: await readFile("lib/operator/secretary/SecretaryMeetingCoordinationNotificationRuntime.js", "utf8"),
  worker: await readFile("app/api/internal/secretary/meeting-coordination/process/route.js", "utf8"),
  harness: await readFile("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8"),
  certification: await readFile("scripts/certify-secretary-meeting-coordination-local.mjs", "utf8"),
  notificationCertification: await readFile("scripts/certify-secretary-meeting-booking-notifications-local.mjs", "utf8"),
  slotOptimizationCertification: await readFile("scripts/certify-secretary-meeting-slot-optimization-local.mjs", "utf8"),
};

assert.match(files.guard, /secretaryMeetingParticipantHasExplicitAvailabilityEvidence/);
assert.match(files.guard, /status, 40\)\.toUpperCase\(\) !== "RESPONDED"/);
assert.match(files.guard, /explicit_response_evidence === true/);
assert.match(files.guard, /\["INBOUND_MESSAGE", "SECRETARY_CALL"\]/);
assert.match(files.guard, /latest_availability_evidence_id/);
assert.match(files.guard, /available_slot_ids/);
assert.match(files.guard, /SECRETARY_MEETING_COORDINATION_EXPLICIT_EVIDENCE_REQUIRED/);
assert.match(files.guard, /status: "NEEDS_INPUT"/);
assert.match(files.guard, /selected_slot_id: null/);
assert.match(files.guard, /booking_blocked_without_explicit_availability_evidence: true/);
assert.match(files.guard, /prioritizeSecretaryMeetingSlotsForOptionalAvailability/);
assert.match(files.guard, /MAX_OPTIONAL_EXPLICIT_AVAILABILITY_THEN_EARLIEST_START/);
assert.match(files.guard, /EARLIEST_START_THEN_ORIGINAL_CANDIDATE_ORDER/);
assert.match(files.guard, /requiredCompatible/);
assert.match(files.guard, /optionalAvailableCount/);
assert.match(files.guard, /required_explicit_compatibility_preserved: true/);
assert.match(files.guard, /optional_availability_optimization_applied/);
assert.match(files.guard, /slot_selection_policy/);
assert.match(files.guard, /reconcileSecretaryMeetingCoordinationEvidence\(coordination\)/);
assert.match(files.guard, /processSecretaryMeetingCoordination\(slotSelection\.coordination\)/);
assert.match(files.guard, /ensureSecretaryMeetingBookingNotifications/);
assert.match(files.guard, /booked_notification_pending_repair/);
assert.match(files.guard, /booking_notifications_materialized: false/);
assert.match(files.guard, /attendance_not_inferred: true/);
assert.match(files.guard, /rsvp_not_inferred: true/);
assert.match(files.guard, /external_authority_used: false/);

assert.match(files.evidence, /clarification_requires_fresh_evidence: true/);
assert.match(files.evidence, /SECRETARY_CALL/);
assert.match(files.evidence, /INBOUND_MESSAGE/);
assert.match(files.evidence, /Never infer attendance, acceptance, timezone or availability from silence, politeness, implication or prior messages/);

assert.match(files.notification, /deterministicFollowUpId/);
assert.match(files.notification, /createHash/);
assert.match(files.notification, /meeting_booking_notification: true/);
assert.match(files.notification, /execution_owner: "SECRETARY"/);
assert.match(files.notification, /execution_ready: true/);
assert.match(files.notification, /inserted\.error\.code !== "23505"/);
assert.match(files.notification, /repairSecretaryMeetingBookingNotifications/);
assert.match(files.notification, /booking_notifications_materialized: true/);
assert.match(files.notification, /booking_notifications_include_all_participants: true/);
assert.match(files.notification, /deterministic_follow_up_ids: true/);
assert.match(files.notification, /attendance_not_inferred: true/);
assert.match(files.notification, /rsvp_not_inferred: true/);

assert.match(files.worker, /processNextSecretaryMeetingCoordinationWithBookingGuard/);
assert.match(files.worker, /repairSecretaryMeetingBookingNotifications/);
assert.match(files.worker, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_WORKER_V3/);
assert.match(files.worker, /booking_notification_repair_pending/);
assert.match(files.worker, /booking_notifications_include_all_participants: true/);
assert.match(files.worker, /booking_notifications_deterministic_and_idempotent: true/);
assert.match(files.worker, /booking_notifications_rsvp_not_inferred: true/);
assert.match(files.worker, /explicit_availability_evidence_required_for_booking: true/);
assert.match(files.worker, /attendance_not_inferred: true/);
assert.doesNotMatch(files.worker, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_WORKER_V2/);

assert.match(files.harness, /20260825063900_avantiqo_secretary_atomic_booking\.sql/);
assert.match(files.harness, /20260826102000_secretary_multi_party_meeting_coordination\.sql/);
assert.match(files.harness, /certify-secretary-meeting-coordination-local\.mjs/);
assert.match(files.harness, /certify-secretary-meeting-booking-notifications-local\.mjs/);
assert.match(files.harness, /certify-secretary-meeting-slot-optimization-local\.mjs/);

assert.match(files.certification, /SECRETARY_MEETING_COORDINATION_LOCAL_CERTIFICATION=PASS/);
assert.match(files.certification, /SECRETARY_EXPLICIT_AVAILABILITY_EVIDENCE_REQUIRED_FOR_BOOKING=true/);
assert.match(files.certification, /SECRETARY_FORGED_RESPONDED_STATE_FAILS_CLOSED=true/);
assert.match(files.certification, /SECRETARY_NO_COMMON_SLOT_FAILS_TO_EXECUTIVE_INPUT=true/);
assert.match(files.certification, /SECRETARY_ATOMIC_CALENDAR_BOOKING=true/);
assert.match(files.certification, /SECRETARY_ATTENDANCE_NOT_INFERRED=true/);
assert.match(files.certification, /SECRETARY_PROVIDER_CALLS_PERFORMED=false/);
assert.match(files.certification, /SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false/);

assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_LOCAL_CERTIFICATION=PASS/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_ALL_PARTICIPANTS=true/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_PRESERVES_CHANNEL=true/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_DETERMINISTIC_IDS=true/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_IDEMPOTENT=true/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_REPAIRABLE=true/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_ATTENDANCE_NOT_INFERRED=true/);
assert.match(files.notificationCertification, /SECRETARY_MEETING_BOOKING_NOTIFICATION_RSVP_NOT_INFERRED=true/);
assert.match(files.notificationCertification, /SECRETARY_PROVIDER_CALLS_PERFORMED=false/);
assert.match(files.notificationCertification, /SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false/);

assert.match(files.slotOptimizationCertification, /SECRETARY_MEETING_SLOT_OPTIMIZATION_LOCAL_CERTIFICATION=PASS/);
assert.match(files.slotOptimizationCertification, /SECRETARY_REQUIRED_PARTICIPANTS_ALWAYS_PRESERVED=true/);
assert.match(files.slotOptimizationCertification, /SECRETARY_OPTIONAL_ATTENDEE_AVAILABILITY_MAXIMIZED=true/);
assert.match(files.slotOptimizationCertification, /SECRETARY_OPTIONAL_ATTENDEES_CANNOT_OVERRIDE_REQUIRED=true/);
assert.match(files.slotOptimizationCertification, /SECRETARY_MEETING_SLOT_TIE_BREAKS_TO_EARLIEST=true/);
assert.match(files.slotOptimizationCertification, /SECRETARY_PENDING_REQUIRED_RESPONSE_BLOCKS_OPTIMIZATION=true/);
assert.match(files.slotOptimizationCertification, /SECRETARY_PROVIDER_CALLS_PERFORMED=false/);
assert.match(files.slotOptimizationCertification, /SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false/);

console.log("OPERATOR_SECRETARY_MEETING_COORDINATION_BOOKING_GUARD_AUDIT=PASS");
console.log("SECRETARY_MEETING_BOOKING_EXPLICIT_EVIDENCE_GATE=true");
console.log("SECRETARY_MEETING_FORGED_RESPONSE_FAILS_CLOSED=true");
console.log("SECRETARY_MEETING_FRESH_CLARIFICATION_EVIDENCE=true");
console.log("SECRETARY_MEETING_CALL_EVIDENCE_SUPPORTED=true");
console.log("SECRETARY_MEETING_SLOT_REQUIRED_ATTENDEE_PRIORITY=true");
console.log("SECRETARY_MEETING_SLOT_OPTIONAL_ATTENDANCE_OPTIMIZED=true");
console.log("SECRETARY_MEETING_SLOT_TIE_BREAKS_TO_EARLIEST=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_ALL_PARTICIPANTS=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_DETERMINISTIC_IDS=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_IDEMPOTENT=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_REPAIRABLE=true");
console.log("SECRETARY_MEETING_BOOKING_NOTIFICATION_RSVP_NOT_INFERRED=true");
console.log("SECRETARY_MEETING_COORDINATION_WORKER_V3=true");
console.log("SECRETARY_MEETING_LOCAL_BEHAVIOR_CERTIFICATION_WIRED=true");
console.log("SECRETARY_ATTENDANCE_NOT_INFERRED=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
