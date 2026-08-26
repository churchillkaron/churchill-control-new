import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  claimSecretaryMeetingCoordination,
  processSecretaryMeetingCoordination,
} from "@/lib/operator/secretary/SecretaryMeetingCoordinationRuntime";
import { reconcileSecretaryMeetingCoordinationEvidence } from "@/lib/operator/secretary/SecretaryMeetingCoordinationEvidenceRuntime";
import { ensureSecretaryMeetingBookingNotifications } from "@/lib/operator/secretary/SecretaryMeetingCoordinationNotificationRuntime";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function participantRows(coordination) {
  return many(
    supabaseAdmin
      .from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", coordination.organization_id)
      .eq("coordination_id", coordination.id)
      .order("created_at", { ascending: true }),
  );
}

function explicitAvailableSlotIds(participant = {}) {
  return new Set(
    list(object(participant.availability).available_slot_ids)
      .map((value) => text(value, 120))
      .filter(Boolean),
  );
}

export function secretaryMeetingParticipantHasExplicitAvailabilityEvidence(participant = {}) {
  if (text(participant.status, 40).toUpperCase() !== "RESPONDED") return true;
  const metadata = object(participant.metadata);
  const availability = object(participant.availability);
  const evidenceKind = text(metadata.latest_availability_evidence_kind, 80).toUpperCase();
  const evidenceId = text(metadata.latest_availability_evidence_id, 160);
  const explicit = metadata.explicit_response_evidence === true;
  const supportedKind = ["INBOUND_MESSAGE", "SECRETARY_CALL"].includes(evidenceKind);
  const availableSlotIds = list(availability.available_slot_ids).map((value) => text(value, 120)).filter(Boolean);
  const clarificationRequired = Boolean(participant.clarification_follow_up_id) || metadata.clarification_requires_fresh_evidence === true;
  const ambiguousEvidenceId = text(metadata.clarification_requested_after_evidence_id, 160);
  const freshAfterClarification = !clarificationRequired || (
    metadata.clarification_response_used === true
    && Boolean(ambiguousEvidenceId)
    && evidenceId !== ambiguousEvidenceId
  );
  return explicit
    && supportedKind
    && Boolean(evidenceId)
    && availableSlotIds.length > 0
    && freshAfterClarification;
}

export function prioritizeSecretaryMeetingSlotsForOptionalAvailability(coordination = {}, participants = []) {
  const slots = list(coordination.candidate_slots);
  const required = participants.filter((row) => row.required !== false);
  const optionalResponded = participants.filter((row) => row.required === false && text(row.status, 40).toUpperCase() === "RESPONDED");

  if (!required.length || required.some((row) => text(row.status, 40).toUpperCase() !== "RESPONDED")) {
    return {
      coordination,
      ready_to_rank: false,
      selection_policy: "MAX_OPTIONAL_EXPLICIT_AVAILABILITY_THEN_EARLIEST_START",
      required_explicit_compatibility_preserved: true,
      required_compatible_slot_count: 0,
      optional_responded_participant_count: optionalResponded.length,
      selected_slot_id: null,
      selected_optional_available_count: 0,
    };
  }

  const requiredAvailability = required.map(explicitAvailableSlotIds);
  const optionalAvailability = optionalResponded.map(explicitAvailableSlotIds);
  const ranked = slots
    .map((slot, index) => ({
      slot,
      index,
      requiredCompatible: requiredAvailability.every((available) => available.has(text(slot?.id, 120))),
      optionalAvailableCount: optionalAvailability.filter((available) => available.has(text(slot?.id, 120))).length,
      startsAt: Number.isFinite(Date.parse(slot?.starts_at)) ? Date.parse(slot.starts_at) : Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => entry.requiredCompatible)
    .sort((left, right) => (
      right.optionalAvailableCount - left.optionalAvailableCount
      || left.startsAt - right.startsAt
      || left.index - right.index
    ));

  if (!ranked.length) {
    return {
      coordination,
      ready_to_rank: true,
      selection_policy: "MAX_OPTIONAL_EXPLICIT_AVAILABILITY_THEN_EARLIEST_START",
      required_explicit_compatibility_preserved: true,
      required_compatible_slot_count: 0,
      optional_responded_participant_count: optionalResponded.length,
      selected_slot_id: null,
      selected_optional_available_count: 0,
    };
  }

  const rankedIds = new Set(ranked.map((entry) => text(entry.slot?.id, 120)));
  const prioritizedSlots = [
    ...ranked.map((entry) => entry.slot),
    ...slots.filter((slot) => !rankedIds.has(text(slot?.id, 120))),
  ];
  const winner = ranked[0];

  return {
    coordination: { ...coordination, candidate_slots: prioritizedSlots },
    ready_to_rank: true,
    selection_policy: "MAX_OPTIONAL_EXPLICIT_AVAILABILITY_THEN_EARLIEST_START",
    tie_breaker: "EARLIEST_START_THEN_ORIGINAL_CANDIDATE_ORDER",
    required_explicit_compatibility_preserved: true,
    required_compatible_slot_count: ranked.length,
    optional_responded_participant_count: optionalResponded.length,
    selected_slot_id: text(winner.slot?.id, 120) || null,
    selected_optional_available_count: winner.optionalAvailableCount,
  };
}

async function failClosed(coordination, participants) {
  const invalid = participants.filter((row) => !secretaryMeetingParticipantHasExplicitAvailabilityEvidence(row));
  if (!invalid.length) return null;
  const staleClarificationEvidence = invalid.filter((row) => {
    const metadata = object(row.metadata);
    return Boolean(row.clarification_follow_up_id)
      || metadata.clarification_requires_fresh_evidence === true;
  });
  const reason = staleClarificationEvidence.length
    ? "SECRETARY_MEETING_COORDINATION_FRESH_CLARIFICATION_EVIDENCE_REQUIRED"
    : "SECRETARY_MEETING_COORDINATION_EXPLICIT_EVIDENCE_REQUIRED";
  const updated = await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({
        status: "NEEDS_INPUT",
        selected_slot_id: null,
        last_error: reason,
        lease_token: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...object(coordination.metadata),
          booking_blocked_without_explicit_availability_evidence: true,
          booking_blocked_without_fresh_clarification_evidence: staleClarificationEvidence.length > 0,
          invalid_participant_ids: invalid.map((row) => row.id),
          stale_clarification_participant_ids: staleClarificationEvidence.map((row) => row.id),
          attendance_not_inferred: true,
          external_authority_used: false,
        },
      })
      .eq("organization_id", coordination.organization_id)
      .eq("id", coordination.id)
      .select("*")
      .single(),
  );
  return {
    status: "needs_input",
    coordination: updated,
    participants,
    selected_slot: null,
    booking_blocked_without_explicit_availability_evidence: true,
    booking_blocked_without_fresh_clarification_evidence: staleClarificationEvidence.length > 0,
    attendance_not_inferred: true,
    external_authority_used: false,
  };
}

async function persistSlotSelectionEvidence(coordination, selection, outcome) {
  if (text(outcome?.coordination?.status, 40).toUpperCase() !== "BOOKED") return outcome;
  const selectedSlotId = text(outcome?.coordination?.selected_slot_id || outcome?.selected_slot?.id, 120);
  const selectedOptionalAvailableCount = selectedSlotId === selection.selected_slot_id
    ? selection.selected_optional_available_count
    : 0;
  const updated = await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({
        metadata: {
          ...object(outcome.coordination.metadata),
          slot_selection_policy: selection.selection_policy,
          slot_selection_tie_breaker: selection.tie_breaker || null,
          required_explicit_compatibility_preserved: true,
          required_compatible_slot_count: selection.required_compatible_slot_count,
          optional_responded_participant_count: selection.optional_responded_participant_count,
          selected_optional_available_count: selectedOptionalAvailableCount,
          optional_availability_optimization_applied: selection.required_compatible_slot_count > 1,
          attendance_not_inferred: true,
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", coordination.organization_id)
      .eq("id", coordination.id)
      .eq("status", "BOOKED")
      .select("*")
      .single(),
  );
  return { ...outcome, coordination: updated };
}

export async function processSecretaryMeetingCoordinationWithBookingGuard(coordination) {
  await reconcileSecretaryMeetingCoordinationEvidence(coordination);
  const participants = await participantRows(coordination);
  const blocked = await failClosed(coordination, participants);
  if (blocked) return blocked;

  const slotSelection = prioritizeSecretaryMeetingSlotsForOptionalAvailability(coordination, participants);
  let outcome = await processSecretaryMeetingCoordination(slotSelection.coordination);
  if (text(outcome?.coordination?.status, 40).toUpperCase() !== "BOOKED") return outcome;

  outcome = await persistSlotSelectionEvidence(coordination, slotSelection, outcome);
  const notificationState = await ensureSecretaryMeetingBookingNotifications(outcome.coordination);
  return {
    ...outcome,
    slot_selection: {
      selection_policy: slotSelection.selection_policy,
      tie_breaker: slotSelection.tie_breaker || null,
      required_explicit_compatibility_preserved: true,
      required_compatible_slot_count: slotSelection.required_compatible_slot_count,
      optional_responded_participant_count: slotSelection.optional_responded_participant_count,
      selected_optional_available_count: slotSelection.selected_optional_available_count,
    },
    booking_notifications_materialized: true,
    booking_notification_count: notificationState.notification_count,
    notification_state: notificationState,
    attendance_not_inferred: true,
    rsvp_not_inferred: true,
    external_authority_used: false,
  };
}

export async function processNextSecretaryMeetingCoordinationWithBookingGuard({ workerId, leaseSeconds = 180 } = {}) {
  const coordination = await claimSecretaryMeetingCoordination({ workerId, leaseSeconds });
  if (!coordination) return { status: "idle", external_authority_used: false };
  try {
    return await processSecretaryMeetingCoordinationWithBookingGuard(coordination);
  } catch (error) {
    const message = text(error?.message || error, 2000);
    const failed = Number(coordination.attempt_count || 0) >= Number(coordination.max_attempts || 100);
    const current = await one(
      supabaseAdmin
        .from("secretary_meeting_coordinations")
        .select("*")
        .eq("organization_id", coordination.organization_id)
        .eq("id", coordination.id)
        .single(),
    );
    const alreadyBooked = text(current?.status, 40).toUpperCase() === "BOOKED";
    const updated = await one(
      supabaseAdmin
        .from("secretary_meeting_coordinations")
        .update({
          status: alreadyBooked ? "BOOKED" : failed ? "FAILED" : coordination.status,
          last_error: alreadyBooked ? null : message,
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
          metadata: alreadyBooked
            ? {
                ...object(current.metadata),
                booking_notifications_materialized: false,
                booking_notification_last_error: message,
                booking_notifications_attendance_not_inferred: true,
                booking_notifications_rsvp_not_inferred: true,
                external_authority_used: false,
              }
            : current.metadata,
        })
        .eq("organization_id", coordination.organization_id)
        .eq("id", coordination.id)
        .select("*")
        .single(),
    );
    return {
      status: alreadyBooked ? "booked_notification_pending_repair" : failed ? "failed" : "collecting",
      coordination: updated,
      error: message,
      attendance_not_inferred: true,
      rsvp_not_inferred: true,
      external_authority_used: false,
    };
  }
}

export default Object.freeze({
  hasExplicitAvailabilityEvidence: secretaryMeetingParticipantHasExplicitAvailabilityEvidence,
  prioritizeSlots: prioritizeSecretaryMeetingSlotsForOptionalAvailability,
  process: processSecretaryMeetingCoordinationWithBookingGuard,
  processNext: processNextSecretaryMeetingCoordinationWithBookingGuard,
});
