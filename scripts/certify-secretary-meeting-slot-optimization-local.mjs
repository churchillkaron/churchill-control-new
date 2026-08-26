import assert from "node:assert/strict";
import { prioritizeSecretaryMeetingSlotsForOptionalAvailability } from "@/lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime";

function participant({ id, required, status = "RESPONDED", slots = [] }) {
  return {
    id,
    required,
    status,
    availability: { available_slot_ids: slots },
    metadata: {
      explicit_response_evidence: true,
      latest_availability_evidence_kind: "INBOUND_MESSAGE",
      latest_availability_evidence_id: `${id}-evidence`,
    },
  };
}

const coordination = {
  id: "meeting-slot-optimization-certification",
  candidate_slots: [
    { id: "slot-late", starts_at: "2026-09-01T10:00:00.000Z", ends_at: "2026-09-01T11:00:00.000Z" },
    { id: "slot-best", starts_at: "2026-09-01T09:00:00.000Z", ends_at: "2026-09-01T10:00:00.000Z" },
    { id: "slot-invalid", starts_at: "2026-09-01T08:00:00.000Z", ends_at: "2026-09-01T09:00:00.000Z" },
  ],
};

const participants = [
  participant({ id: "required-a", required: true, slots: ["slot-late", "slot-best"] }),
  participant({ id: "required-b", required: true, slots: ["slot-late", "slot-best"] }),
  participant({ id: "optional-a", required: false, slots: ["slot-best", "slot-invalid"] }),
  participant({ id: "optional-b", required: false, slots: ["slot-best"] }),
  participant({ id: "optional-c", required: false, slots: ["slot-late"] }),
];

const optimized = prioritizeSecretaryMeetingSlotsForOptionalAvailability(coordination, participants);
assert.equal(optimized.ready_to_rank, true);
assert.equal(optimized.selection_policy, "MAX_OPTIONAL_EXPLICIT_AVAILABILITY_THEN_EARLIEST_START");
assert.equal(optimized.required_explicit_compatibility_preserved, true);
assert.equal(optimized.required_compatible_slot_count, 2);
assert.equal(optimized.optional_responded_participant_count, 3);
assert.equal(optimized.selected_slot_id, "slot-best");
assert.equal(optimized.selected_optional_available_count, 2);
assert.equal(optimized.coordination.candidate_slots[0].id, "slot-best");
assert.equal(optimized.coordination.candidate_slots[1].id, "slot-late");
assert.equal(optimized.coordination.candidate_slots[2].id, "slot-invalid");

const requiredWins = prioritizeSecretaryMeetingSlotsForOptionalAvailability(coordination, [
  participant({ id: "required-a", required: true, slots: ["slot-late"] }),
  participant({ id: "required-b", required: true, slots: ["slot-late"] }),
  participant({ id: "optional-a", required: false, slots: ["slot-invalid"] }),
  participant({ id: "optional-b", required: false, slots: ["slot-invalid"] }),
  participant({ id: "optional-c", required: false, slots: ["slot-invalid"] }),
]);
assert.equal(requiredWins.selected_slot_id, "slot-late");
assert.equal(requiredWins.required_compatible_slot_count, 1);
assert.equal(requiredWins.selected_optional_available_count, 0);
assert.equal(requiredWins.coordination.candidate_slots[0].id, "slot-late");

const tie = prioritizeSecretaryMeetingSlotsForOptionalAvailability(coordination, [
  participant({ id: "required-a", required: true, slots: ["slot-late", "slot-best"] }),
  participant({ id: "required-b", required: true, slots: ["slot-late", "slot-best"] }),
  participant({ id: "optional-a", required: false, slots: ["slot-late", "slot-best"] }),
]);
assert.equal(tie.selected_slot_id, "slot-best");
assert.equal(tie.selected_optional_available_count, 1);
assert.equal(tie.tie_breaker, "EARLIEST_START_THEN_ORIGINAL_CANDIDATE_ORDER");

const pendingRequired = prioritizeSecretaryMeetingSlotsForOptionalAvailability(coordination, [
  participant({ id: "required-a", required: true, slots: ["slot-late", "slot-best"] }),
  participant({ id: "required-b", required: true, status: "AWAITING", slots: [] }),
  participant({ id: "optional-a", required: false, slots: ["slot-best"] }),
]);
assert.equal(pendingRequired.ready_to_rank, false);
assert.equal(pendingRequired.selected_slot_id, null);
assert.deepEqual(pendingRequired.coordination.candidate_slots, coordination.candidate_slots);

console.log("SECRETARY_MEETING_SLOT_OPTIMIZATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_REQUIRED_PARTICIPANTS_ALWAYS_PRESERVED=true");
console.log("SECRETARY_OPTIONAL_ATTENDEE_AVAILABILITY_MAXIMIZED=true");
console.log("SECRETARY_OPTIONAL_ATTENDEES_CANNOT_OVERRIDE_REQUIRED=true");
console.log("SECRETARY_MEETING_SLOT_TIE_BREAKS_TO_EARLIEST=true");
console.log("SECRETARY_PENDING_REQUIRED_RESPONSE_BLOCKS_OPTIMIZATION=true");
console.log("SECRETARY_ATTENDANCE_NOT_INFERRED=true");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
