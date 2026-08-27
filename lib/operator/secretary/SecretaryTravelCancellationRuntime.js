import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_V1";
const CANCELLATION_CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_CANCELLATION_V1";
const LEDGER_KEY = "travel_operations_v1";
const OUTCOMES = new Set(["CANCELLED", "VOIDED"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function iso(value, field, { required = false } = {}) {
  const clean = text(value, 180);
  if (!clean) {
    if (required) throw new Error(`SECRETARY_TRAVEL_CANCELLATION_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_TRAVEL_CANCELLATION_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicId(seed) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function loadTravelJob(organization, jobId) {
  const id = text(jobId, 120);
  if (!id) throw new Error("SECRETARY_TRAVEL_CANCELLATION_JOB_REQUIRED");
  const job = await one(
    supabaseAdmin.from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_TRAVEL_CANCELLATION_JOB_NOT_FOUND");
  if (text(object(job.metadata).job_kind, 80).toUpperCase() !== "TRAVEL_COORDINATION") {
    throw new Error("SECRETARY_TRAVEL_CANCELLATION_JOB_KIND_INVALID");
  }
  return job;
}

async function authorizeOperationalActor({ organization, job, actor }) {
  const ownerPartyId = text(object(job.metadata).canonical_owner_party_id, 120) || text(job.requested_by_party_id, 120);
  if (!ownerPartyId) throw new Error("SECRETARY_TRAVEL_CANCELLATION_CANONICAL_OWNER_REQUIRED");
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId,
    scope: "TRAVEL_COORDINATION",
    instruction: "Record explicit evidence that a previously confirmed travel item was cancelled or voided. Do not send or infer a cancellation request, accept a fee, settle a refund, or book a replacement.",
    requiresOwnerAuthority: false,
    at: new Date().toISOString(),
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_TRAVEL_CANCELLATION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || ownerPartyId;
  if (actor !== ownerPartyId && actor !== operational) {
    throw new Error("SECRETARY_TRAVEL_CANCELLATION_ACTOR_NOT_AUTHORIZED");
  }
  return { ownerPartyId, operational, routing };
}

function cancellationPayload(payload = {}) {
  const confirmationId = text(payload.confirmation_id || payload.confirmationId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const outcome = text(payload.outcome, 40).toUpperCase();
  const cancelledAt = iso(payload.cancelled_at || payload.cancelledAt, "cancelled_at", { required: true });
  if (!confirmationId) throw new Error("SECRETARY_TRAVEL_CANCELLATION_CONFIRMATION_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_TRAVEL_CANCELLATION_EVIDENCE_REQUIRED");
  if (!OUTCOMES.has(outcome)) throw new Error("SECRETARY_TRAVEL_CANCELLATION_OUTCOME_INVALID");
  return {
    confirmation_id: confirmationId,
    evidence_id: evidenceId,
    outcome,
    cancelled_at: cancelledAt,
    cancellation_reference: text(payload.cancellation_reference || payload.cancellationReference, 500) || null,
    reason: text(payload.reason, 3000) || null,
    source_reference: text(payload.source_reference || payload.sourceReference, 1000) || null,
    notes: text(payload.notes, 3000) || null,
  };
}

function exactReplay(existing, event) {
  return existing.status === event.outcome
    && text(existing.cancellation_evidence_id, 500) === event.evidence_id
    && text(existing.cancelled_at, 180) === event.cancelled_at
    && text(existing.cancellation_reference, 500) === text(event.cancellation_reference, 500)
    && text(existing.cancellation_reason, 3000) === text(event.reason, 3000)
    && text(existing.cancellation_source_reference, 1000) === text(event.source_reference, 1000);
}

export async function recordSecretaryTravelCancellation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  if (!jobId) throw new Error("SECRETARY_TRAVEL_CANCELLATION_JOB_REQUIRED");
  const event = cancellationPayload(payload);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const job = await loadTravelJob(organization, jobId);
    const auth = await authorizeOperationalActor({ organization, job, actor });
    const ledger = object(object(job.metadata)[LEDGER_KEY]);
    if (ledger.contract !== CONTRACT) throw new Error("SECRETARY_TRAVEL_CANCELLATION_CONFIRMATION_NOT_FOUND");
    const confirmations = list(ledger.confirmations);
    const index = confirmations.findIndex((row) => row.confirmation_id === event.confirmation_id);
    if (index < 0) throw new Error("SECRETARY_TRAVEL_CANCELLATION_CONFIRMATION_NOT_FOUND");
    const existing = object(confirmations[index]);

    if (existing.status !== "CONFIRMED") {
      if (exactReplay(existing, event)) {
        return {
          status: "recorded",
          contract: CANCELLATION_CONTRACT,
          travel_operations_contract: CONTRACT,
          confirmation: existing,
          cancellation_id: existing.cancellation_id || null,
          register_version: Number(ledger.version || 0),
          replay_safe: true,
          cancellation_evidence_required: true,
          cancellation_timestamp_inferred: false,
          cancellation_inferred: false,
          cancellation_intent_is_cancellation: false,
          cancellation_request_sent: false,
          cancellation_fee_commitment_created: false,
          refund_settlement_authority_created: false,
          rebooking_authority_created: false,
          booking_authority_created: false,
          payment_authority_created: false,
          binding_authority_created: false,
          approval_authority_delegated: false,
          platform_permissions_mutated: false,
          external_authority_used: false,
        };
      }
      throw new Error("SECRETARY_TRAVEL_CANCELLATION_STALE_CONFIRMATION_REJECTED");
    }

    const version = Number(ledger.version || 0) + 1;
    const recordedAt = new Date().toISOString();
    const cancellationId = deterministicId(`${jobId}:${event.confirmation_id}:${event.outcome}:${event.evidence_id}:${event.cancelled_at}`);
    const cancelled = {
      ...existing,
      status: event.outcome,
      cancellation_id: cancellationId,
      cancellation_evidence_id: event.evidence_id,
      cancellation_reference: event.cancellation_reference,
      cancellation_reason: event.reason,
      cancellation_source_reference: event.source_reference,
      cancellation_notes: event.notes,
      cancelled_at: event.cancelled_at,
      cancellation_recorded_at: recordedAt,
      cancellation_recorded_by_party_id: actor,
      cancellation_canonical_owner_party_id: auth.ownerPartyId,
      cancellation_timestamp_inferred: false,
      cancellation_inferred: false,
      cancellation_intent_is_cancellation: false,
      cancellation_request_sent: false,
      cancellation_fee_commitment_created: false,
      refund_settlement_authority_created: false,
      rebooking_authority_created: false,
    };
    const nextConfirmations = confirmations.map((row, rowIndex) => rowIndex === index ? cancelled : row);
    const historyEvent = {
      event: event.outcome === "VOIDED" ? "CONFIRMATION_VOIDED" : "CONFIRMATION_CANCELLED",
      version,
      confirmation_id: event.confirmation_id,
      cancellation_id: cancellationId,
      outcome: event.outcome,
      evidence_id: event.evidence_id,
      cancellation_reference: event.cancellation_reference,
      cancelled_at: event.cancelled_at,
      recorded_at: recordedAt,
      recorded_by_party_id: actor,
      cancellation_timestamp_inferred: false,
      cancellation_inferred: false,
      cancellation_intent_is_cancellation: false,
    };
    const nextLedger = {
      ...ledger,
      contract: CONTRACT,
      version,
      confirmations: nextConfirmations.slice(-500),
      history: [...list(ledger.history), historyEvent].slice(-1000),
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      cancellation_fee_commitment_created: false,
      refund_settlement_authority_created: false,
      rebooking_authority_created: false,
      external_authority_used: false,
    };
    const metadata = {
      ...object(job.metadata),
      [LEDGER_KEY]: nextLedger,
      travel_operations_contract: CONTRACT,
      travel_operations_version: version,
      travel_cancellation_contract: CANCELLATION_CONTRACT,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      cancellation_fee_commitment_created: false,
      refund_settlement_authority_created: false,
      rebooking_authority_created: false,
      approval_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const updated = await supabaseAdmin.from("secretary_jobs")
      .update({ metadata, updated_at: recordedAt })
      .eq("organization_id", organization)
      .eq("id", jobId)
      .eq("updated_at", job.updated_at)
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) continue;

    return {
      status: "recorded",
      contract: CANCELLATION_CONTRACT,
      travel_operations_contract: CONTRACT,
      confirmation: cancelled,
      cancellation_id: cancellationId,
      register_version: version,
      replay_safe: false,
      cancellation_evidence_required: true,
      cancellation_timestamp_inferred: false,
      cancellation_inferred: false,
      cancellation_intent_is_cancellation: false,
      cancellation_request_sent: false,
      cancellation_fee_commitment_created: false,
      refund_settlement_authority_created: false,
      rebooking_authority_created: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      approval_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
  }
  throw new Error("SECRETARY_TRAVEL_CANCELLATION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export default Object.freeze({ recordCancellation: recordSecretaryTravelCancellation });
