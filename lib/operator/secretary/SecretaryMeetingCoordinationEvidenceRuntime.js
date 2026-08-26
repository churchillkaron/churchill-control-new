import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  claimSecretaryMeetingCoordination,
  processSecretaryMeetingCoordination,
} from "@/lib/operator/secretary/SecretaryMeetingCoordinationRuntime";

function text(value, limit = 12000) {
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

async function participants(coordination) {
  return many(
    supabaseAdmin
      .from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", coordination.organization_id)
      .eq("coordination_id", coordination.id)
      .order("created_at", { ascending: true }),
  );
}

async function executionForFollowUp(participant, followUpId) {
  if (!followUpId) return null;
  return one(
    supabaseAdmin
      .from("secretary_follow_up_executions")
      .select("*")
      .eq("organization_id", participant.organization_id)
      .eq("follow_up_id", followUpId)
      .maybeSingle(),
  );
}

async function firstFreshInbound(participant, execution) {
  if (!execution?.conversation_id) return null;
  const after = execution.completed_at || execution.updated_at || execution.created_at;
  if (!after) return null;
  const rows = await many(
    supabaseAdmin
      .from("communication_messages")
      .select("id,body,subject,received_at,created_at")
      .eq("organization_id", participant.organization_id)
      .eq("conversation_id", execution.conversation_id)
      .eq("direction", "INBOUND")
      .gte("created_at", after)
      .order("created_at", { ascending: true })
      .limit(20),
  );
  return rows[0] || null;
}

async function completedCallEvidence(participant, execution) {
  if (!execution?.outbound_call_request_id) return null;
  const request = await one(
    supabaseAdmin
      .from("secretary_outbound_call_requests")
      .select("id,call_id,status,completed_at,updated_at")
      .eq("organization_id", participant.organization_id)
      .eq("id", execution.outbound_call_request_id)
      .maybeSingle(),
  );
  if (!request?.call_id || text(request.status, 40).toUpperCase() !== "COMPLETED") return null;
  const call = await one(
    supabaseAdmin
      .from("secretary_calls")
      .select("id,transcript,summary,answered_at,ended_at,updated_at,status")
      .eq("organization_id", participant.organization_id)
      .eq("id", request.call_id)
      .maybeSingle(),
  );
  const body = text(call?.transcript, 30000) || text(call?.summary, 12000);
  if (!body) return null;
  return {
    source_kind: "SECRETARY_CALL",
    source_id: call.id,
    body,
    received_at: call.ended_at || call.updated_at || request.completed_at || request.updated_at || new Date().toISOString(),
  };
}

function availabilitySystem() {
  return [
    "You are Avantiqo Executive Secretary interpreting one fresh participant response about proposed meeting times.",
    "Use only this response and the supplied candidate slots.",
    "Never infer attendance, acceptance, timezone or availability from silence, politeness, implication or prior messages.",
    "A candidate slot is available only when this response explicitly says the participant can attend that slot or clearly accepts that exact candidate time.",
    "A candidate slot is unavailable only when this response explicitly rejects it.",
    "If the response is vague, contradictory, asks a question, or proposes a time that does not exactly equal a candidate slot, needs_clarification must be true.",
    "Return exactly one JSON object with available_slot_ids, unavailable_slot_ids, none_work, needs_clarification, clarification_reason, confidence.",
  ].join("\n");
}

async function extractFreshAvailability(coordination, participant, evidence) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: coordination.organization_id,
    party_id: participant.party_id,
    system: availabilitySystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        candidate_slots: list(coordination.candidate_slots),
        response_source: evidence.source_kind,
        response_text: text(evidence.body, 30000),
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "EXTRACT_FRESH_MEETING_AVAILABILITY",
      secretary_meeting_coordination_id: coordination.id,
      participant_id: participant.id,
      evidence_source_id: evidence.source_id,
      raw_reasoning_persisted: false,
      external_authority_used: false,
    },
    mode: "fast",
    max_output_tokens: 700,
  });

  const parsed = object(result?.parsed);
  const valid = new Set(list(coordination.candidate_slots).map((slot) => text(slot.id, 120)).filter(Boolean));
  const available = [...new Set(list(parsed.available_slot_ids).map((id) => text(id, 120)).filter((id) => valid.has(id)))];
  const unavailable = [...new Set(list(parsed.unavailable_slot_ids).map((id) => text(id, 120)).filter((id) => valid.has(id)))];
  const confidenceRaw = Number(parsed.confidence);
  return {
    available_slot_ids: available,
    unavailable_slot_ids: unavailable,
    none_work: parsed.none_work === true,
    needs_clarification: parsed.needs_clarification === true,
    clarification_reason: text(parsed.clarification_reason, 1200) || null,
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(confidenceRaw, 1)) : null,
  };
}

async function persistEvidence(coordination, participant, evidence, availability, { clarified = false } = {}) {
  const terminalStatus = availability.needs_clarification
    ? "AMBIGUOUS"
    : availability.none_work || availability.available_slot_ids.length === 0
      ? "UNAVAILABLE"
      : "RESPONDED";

  return one(
    supabaseAdmin
      .from("secretary_meeting_coordination_participants")
      .update({
        status: terminalStatus,
        inbound_message_id: evidence.source_kind === "INBOUND_MESSAGE" ? evidence.source_id : participant.inbound_message_id || null,
        received_at: evidence.received_at,
        response_body: text(evidence.body, 30000),
        availability,
        extraction_confidence: availability.confidence,
        last_error: availability.needs_clarification ? "MEETING_AVAILABILITY_AMBIGUOUS" : null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...object(participant.metadata),
          explicit_response_evidence: true,
          latest_availability_evidence_kind: evidence.source_kind,
          latest_availability_evidence_id: evidence.source_id,
          clarification_response_used: clarified,
          attendance_not_inferred: true,
          external_authority_used: false,
        },
      })
      .eq("organization_id", coordination.organization_id)
      .eq("id", participant.id)
      .select("*")
      .single(),
  );
}

async function reconcileAmbiguousParticipant(coordination, participant) {
  if (participant.status !== "AMBIGUOUS" || !participant.clarification_follow_up_id) return participant;
  const execution = await executionForFollowUp(participant, participant.clarification_follow_up_id);
  if (!execution || !["COMPLETED", "QUEUED"].includes(text(execution.status, 40).toUpperCase())) return participant;

  let evidence = null;
  if (text(participant.action_type, 40).toUpperCase() === "CALL") {
    evidence = await completedCallEvidence(participant, execution);
  } else {
    const inbound = await firstFreshInbound(participant, execution);
    if (inbound) {
      evidence = {
        source_kind: "INBOUND_MESSAGE",
        source_id: inbound.id,
        body: text(inbound.body, 30000) || text(inbound.subject, 4000),
        received_at: inbound.received_at || inbound.created_at || new Date().toISOString(),
      };
    }
  }
  if (!evidence?.body) return participant;
  if (text(object(participant.metadata).latest_availability_evidence_id, 120) === text(evidence.source_id, 120)) return participant;
  const availability = await extractFreshAvailability(coordination, participant, evidence);
  return persistEvidence(coordination, participant, evidence, availability, { clarified: true });
}

async function reconcileCallParticipant(coordination, participant) {
  if (text(participant.action_type, 40).toUpperCase() !== "CALL") return participant;
  if (!["REQUESTED", "AWAITING"].includes(participant.status)) return participant;
  const execution = await executionForFollowUp(participant, participant.follow_up_id);
  if (!execution) return participant;
  const evidence = await completedCallEvidence(participant, execution);
  if (!evidence?.body) return participant;
  if (text(object(participant.metadata).latest_availability_evidence_id, 120) === text(evidence.source_id, 120)) return participant;
  const availability = await extractFreshAvailability(coordination, participant, evidence);
  return persistEvidence(coordination, participant, evidence, availability);
}

export async function reconcileSecretaryMeetingCoordinationEvidence(coordination) {
  const rows = await participants(coordination);
  const reconciled = [];
  for (const row of rows) {
    let current = await reconcileAmbiguousParticipant(coordination, row);
    current = await reconcileCallParticipant(coordination, current);
    reconciled.push(current);
  }
  return {
    status: "completed",
    coordination_id: coordination.id,
    participants: reconciled,
    call_evidence_supported: true,
    clarification_requires_fresh_evidence: true,
    attendance_not_inferred: true,
    external_authority_used: false,
  };
}

export async function processSecretaryMeetingCoordinationSafely(coordination) {
  await reconcileSecretaryMeetingCoordinationEvidence(coordination);
  return processSecretaryMeetingCoordination(coordination);
}

export async function processNextSecretaryMeetingCoordinationSafely({ workerId, leaseSeconds = 180 } = {}) {
  const coordination = await claimSecretaryMeetingCoordination({ workerId, leaseSeconds });
  if (!coordination) return { status: "idle", external_authority_used: false };
  try {
    return await processSecretaryMeetingCoordinationSafely(coordination);
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
  reconcile: reconcileSecretaryMeetingCoordinationEvidence,
  process: processSecretaryMeetingCoordinationSafely,
  processNext: processNextSecretaryMeetingCoordinationSafely,
});
