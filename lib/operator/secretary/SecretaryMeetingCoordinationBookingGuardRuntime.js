import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  claimSecretaryMeetingCoordination,
  processSecretaryMeetingCoordination,
} from "@/lib/operator/secretary/SecretaryMeetingCoordinationRuntime";
import { reconcileSecretaryMeetingCoordinationEvidence } from "@/lib/operator/secretary/SecretaryMeetingCoordinationEvidenceRuntime";

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

export function secretaryMeetingParticipantHasExplicitAvailabilityEvidence(participant = {}) {
  if (text(participant.status, 40).toUpperCase() !== "RESPONDED") return true;
  const metadata = object(participant.metadata);
  const availability = object(participant.availability);
  const evidenceKind = text(metadata.latest_availability_evidence_kind, 80).toUpperCase();
  const evidenceId = text(metadata.latest_availability_evidence_id, 160);
  const explicit = metadata.explicit_response_evidence === true;
  const supportedKind = ["INBOUND_MESSAGE", "SECRETARY_CALL"].includes(evidenceKind);
  const availableSlotIds = list(availability.available_slot_ids).map((value) => text(value, 120)).filter(Boolean);
  return explicit && supportedKind && Boolean(evidenceId) && availableSlotIds.length > 0;
}

async function failClosed(coordination, participants) {
  const invalid = participants.filter((row) => !secretaryMeetingParticipantHasExplicitAvailabilityEvidence(row));
  if (!invalid.length) return null;
  const updated = await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({
        status: "NEEDS_INPUT",
        selected_slot_id: null,
        last_error: "SECRETARY_MEETING_COORDINATION_EXPLICIT_EVIDENCE_REQUIRED",
        lease_token: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...object(coordination.metadata),
          booking_blocked_without_explicit_availability_evidence: true,
          invalid_participant_ids: invalid.map((row) => row.id),
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
    attendance_not_inferred: true,
    external_authority_used: false,
  };
}

export async function processSecretaryMeetingCoordinationWithBookingGuard(coordination) {
  await reconcileSecretaryMeetingCoordinationEvidence(coordination);
  const participants = await participantRows(coordination);
  const blocked = await failClosed(coordination, participants);
  if (blocked) return blocked;
  return processSecretaryMeetingCoordination(coordination);
}

export async function processNextSecretaryMeetingCoordinationWithBookingGuard({ workerId, leaseSeconds = 180 } = {}) {
  const coordination = await claimSecretaryMeetingCoordination({ workerId, leaseSeconds });
  if (!coordination) return { status: "idle", external_authority_used: false };
  try {
    return await processSecretaryMeetingCoordinationWithBookingGuard(coordination);
  } catch (error) {
    const message = text(error?.message || error, 2000);
    const failed = Number(coordination.attempt_count || 0) >= Number(coordination.max_attempts || 100);
    const updated = await one(
      supabaseAdmin
        .from("secretary_meeting_coordinations")
        .update({
          status: failed ? "FAILED" : coordination.status,
          last_error: message,
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", coordination.organization_id)
        .eq("id", coordination.id)
        .select("*")
        .single(),
    );
    return {
      status: failed ? "failed" : "collecting",
      coordination: updated,
      error: message,
      attendance_not_inferred: true,
      external_authority_used: false,
    };
  }
}

export default Object.freeze({
  hasExplicitAvailabilityEvidence: secretaryMeetingParticipantHasExplicitAvailabilityEvidence,
  process: processSecretaryMeetingCoordinationWithBookingGuard,
  processNext: processNextSecretaryMeetingCoordinationWithBookingGuard,
});
