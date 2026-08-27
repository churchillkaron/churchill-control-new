import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_V1";
const LEDGER_KEY = "travel_operations_v1";
const CONFIRMATION_KINDS = new Set(["FLIGHT", "TRAIN", "FERRY", "GROUND_TRANSPORT", "HOTEL", "MEETING", "OTHER"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function iso(value, field) {
  const clean = text(value, 160);
  if (!clean) return null;
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_TRAVEL_OPERATIONS_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function deterministicId(seed) {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

function normalizeCorrection(payload = {}, existing = {}) {
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CORRECTION_EVIDENCE_REQUIRED");
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CORRECTION_REASON_REQUIRED");
  const kind = text(payload.kind || existing.kind, 80).toUpperCase();
  if (!CONFIRMATION_KINDS.has(kind)) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_KIND_INVALID");
  const startsAt = payload.starts_at !== undefined || payload.startsAt !== undefined
    ? iso(payload.starts_at || payload.startsAt, "starts_at")
    : existing.starts_at || null;
  const endsAt = payload.ends_at !== undefined || payload.endsAt !== undefined
    ? iso(payload.ends_at || payload.endsAt, "ends_at")
    : existing.ends_at || null;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_WINDOW_INVALID");
  }
  const value = (field, camel, limit = 1000) => payload[field] !== undefined || payload[camel] !== undefined
    ? text(payload[field] ?? payload[camel], limit) || null
    : existing[field] ?? null;
  return {
    evidence_id: evidenceId,
    reason,
    source_reference: value("source_reference", "sourceReference", 1000),
    confirmation: {
      ...existing,
      kind,
      title: value("title", "title", 500) || kind,
      confirmation_reference: value("confirmation_reference", "confirmationReference", 500),
      provider_name: value("provider_name", "providerName", 500),
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: value("timezone", "timezone", 120),
      origin: value("origin", "origin", 1000),
      destination: value("destination", "destination", 1000),
      location: value("location", "location", 1000),
      notes: value("notes", "notes", 3000),
    },
  };
}

export async function correctSecretaryTravelConfirmation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const supersedesId = text(payload.supersedes_confirmation_id || payload.supersedesConfirmationId, 120);
  if (!jobId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_REQUIRED");
  if (!supersedesId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_SUPERSEDES_CONFIRMATION_REQUIRED");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const job = await one(
      supabaseAdmin.from("secretary_jobs")
        .select("*")
        .eq("organization_id", organization)
        .eq("id", jobId)
        .maybeSingle(),
    );
    if (!job) throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_NOT_FOUND");
    if (text(object(job.metadata).job_kind, 80).toUpperCase() !== "TRAVEL_COORDINATION") {
      throw new Error("SECRETARY_TRAVEL_OPERATIONS_JOB_KIND_INVALID");
    }
    const ownerPartyId = text(object(job.metadata).canonical_owner_party_id, 120) || text(job.requested_by_party_id, 120);
    if (!ownerPartyId) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CANONICAL_OWNER_REQUIRED");
    const routing = await resolveSecretaryAdministrativeCoverage({
      organizationId: organization,
      ownerPartyId,
      scope: "TRAVEL_COORDINATION",
      instruction: "Correct evidenced travel confirmation",
      requiresOwnerAuthority: false,
      at: new Date().toISOString(),
    });
    if (routing.coverage_routing_review_required === true) {
      throw new Error(`SECRETARY_TRAVEL_OPERATIONS_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
    }
    const operational = text(routing.operational_assignee_party_id, 120) || ownerPartyId;
    if (actor !== ownerPartyId && actor !== operational) throw new Error("SECRETARY_TRAVEL_OPERATIONS_ACTOR_NOT_AUTHORIZED");

    const ledger = object(object(job.metadata)[LEDGER_KEY]);
    if (ledger.contract !== CONTRACT) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_NOT_FOUND");
    const confirmations = list(ledger.confirmations);
    const index = confirmations.findIndex((row) => row.confirmation_id === supersedesId);
    if (index < 0) throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_NOT_FOUND");
    const existing = object(confirmations[index]);
    if (existing.status !== "CONFIRMED") throw new Error("SECRETARY_TRAVEL_OPERATIONS_STALE_CORRECTION_REJECTED");

    const correction = normalizeCorrection(payload, existing);
    if (!correction.confirmation.confirmation_reference) {
      throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_REFERENCE_REQUIRED");
    }
    const version = Number(ledger.version || 0) + 1;
    const correctedAt = new Date().toISOString();
    const correctedId = deterministicId(`${jobId}:${supersedesId}:${correction.evidence_id}:${version}`);
    const replacement = {
      ...correction.confirmation,
      confirmation_id: correctedId,
      status: "CONFIRMED",
      version,
      evidence_id: correction.evidence_id,
      source_reference: correction.source_reference,
      recorded_at: correctedAt,
      recorded_by_party_id: actor,
      canonical_owner_party_id: ownerPartyId,
      supersedes_confirmation_id: supersedesId,
      correction_reason: correction.reason,
      confirmation_inferred: false,
    };
    const nextConfirmations = confirmations.map((row, rowIndex) => rowIndex === index
      ? { ...row, status: "SUPERSEDED", superseded_by_confirmation_id: correctedId, superseded_at: correctedAt }
      : row);
    nextConfirmations.push(replacement);
    const nextLedger = {
      ...ledger,
      contract: CONTRACT,
      version,
      confirmations: nextConfirmations.slice(-500),
      history: [...list(ledger.history), {
        event: "CONFIRMATION_CORRECTED",
        version,
        confirmation_id: correctedId,
        supersedes_confirmation_id: supersedesId,
        evidence_id: correction.evidence_id,
        reason: correction.reason,
        corrected_at: correctedAt,
      }].slice(-1000),
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      external_authority_used: false,
    };
    const metadata = {
      ...object(job.metadata),
      [LEDGER_KEY]: nextLedger,
      travel_operations_contract: CONTRACT,
      travel_operations_version: version,
      ...secretaryAdministrativeCoverageMetadata(routing),
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      approval_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const updated = await supabaseAdmin.from("secretary_jobs")
      .update({ metadata, updated_at: correctedAt })
      .eq("organization_id", organization)
      .eq("id", jobId)
      .eq("updated_at", job.updated_at)
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) continue;
    return {
      status: "corrected",
      contract: CONTRACT,
      confirmation: replacement,
      superseded_confirmation_id: supersedesId,
      register_version: version,
      confirmation_inferred: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      approval_authority_delegated: false,
      external_authority_used: false,
    };
  }
  throw new Error("SECRETARY_TRAVEL_OPERATIONS_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

export default Object.freeze({ correctConfirmation: correctSecretaryTravelConfirmation });
