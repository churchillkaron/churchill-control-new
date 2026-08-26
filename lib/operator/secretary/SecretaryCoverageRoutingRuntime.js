import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_COVERAGE_ROUTING_V1";
const SOURCE = "secretary_absence_coverage";
const ALLOWED_SCOPES = new Set([
  "CALENDAR_COORDINATION",
  "CORRESPONDENCE_TRIAGE",
  "CALL_SCREENING",
  "TASK_ROUTING",
  "FOLLOW_UP_COORDINATION",
  "MEETING_COORDINATION",
  "VISITOR_COORDINATION",
  "DOCUMENT_COORDINATION",
  "DEADLINE_COORDINATION",
  "EXPENSE_ADMINISTRATION",
  "TRAVEL_COORDINATION",
]);
const FORBIDDEN_SCOPE_PATTERN = /(PAYMENT|PURCHASE|SIGN|CONTRACT|LEGAL|BINDING|SUBMISSION|FARE|RATE|APPROVAL|CREDENTIAL|PASSWORD|SECRET|TOKEN)/i;

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

function normalizeScope(value) {
  const scope = text(value, 120).toUpperCase();
  if (!scope) throw new Error("SECRETARY_COVERAGE_ROUTING_SCOPE_REQUIRED");
  if (FORBIDDEN_SCOPE_PATTERN.test(scope) || !ALLOWED_SCOPES.has(scope)) {
    throw new Error(`SECRETARY_COVERAGE_ROUTING_SCOPE_FORBIDDEN:${scope}`);
  }
  return scope;
}

function normalizeAt(value) {
  const raw = text(value, 180);
  if (!raw) return new Date().toISOString();
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error("SECRETARY_COVERAGE_ROUTING_AT_INVALID");
  return new Date(parsed).toISOString();
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

function temporalActive(metadata, at) {
  if (["CANCELLED", "ENDED_EARLY"].includes(text(metadata.coverage_status, 80).toUpperCase())) return false;
  const current = Date.parse(at);
  const starts = Date.parse(text(metadata.starts_at, 180));
  const ends = Date.parse(text(metadata.ends_at, 180));
  return [current, starts, ends].every(Number.isFinite) && current >= starts && current < ends;
}

function scopeCovered(metadata, scope) {
  return list(metadata.coverage_scopes)
    .map((item) => text(item, 120).toUpperCase())
    .includes(scope);
}

function validAcknowledgement(metadata) {
  const delegatePartyId = text(metadata.delegate_party_id, 120);
  const acknowledgement = object(metadata.handoff_acknowledgement);
  const evidenceId = text(acknowledgement.evidence_id, 300);
  const acknowledgedBy = text(acknowledgement.acknowledged_by_party_id, 120);
  return Boolean(delegatePartyId && evidenceId && acknowledgedBy === delegatePartyId);
}

function ownerResult({ organization, ownerPartyId, scope, at, reason, pendingCoverage = null }) {
  return {
    status: "owner_routing",
    contract: CONTRACT,
    organization_id: organization,
    scope,
    evaluated_at: at,
    canonical_owner_party_id: ownerPartyId,
    operational_assignee_party_id: ownerPartyId,
    coverage_applied: false,
    coverage_id: pendingCoverage?.id || null,
    coverage_version: pendingCoverage ? Number(object(pendingCoverage.metadata).version || 1) : null,
    delegate_party_id: pendingCoverage ? text(object(pendingCoverage.metadata).delegate_party_id, 120) || null : null,
    handoff_evidence_id: null,
    routing_reason: reason,
    coverage_requires_acknowledgement: true,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export async function resolveSecretaryActiveCoverage({
  context = {},
  ownerPartyId,
  scope,
  at = null,
  requiresOwnerAuthority = false,
} = {}) {
  const organization = organizationId(context);
  const owner = text(ownerPartyId, 120);
  if (!owner) throw new Error("SECRETARY_COVERAGE_ROUTING_OWNER_PARTY_REQUIRED");
  const normalizedScope = normalizeScope(scope);
  const evaluatedAt = normalizeAt(at);

  if (requiresOwnerAuthority === true) {
    return ownerResult({
      organization,
      ownerPartyId: owner,
      scope: normalizedScope,
      at: evaluatedAt,
      reason: "OWNER_AUTHORITY_REQUIRED",
    });
  }

  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("id,organization_id,owner_party_id,contact_party_id,status,source,metadata,created_at,updated_at")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .eq("owner_party_id", owner)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(100),
  );

  const active = rows.filter((row) => {
    const metadata = object(row.metadata);
    return temporalActive(metadata, evaluatedAt) && scopeCovered(metadata, normalizedScope);
  });

  const acknowledged = active.filter((row) => validAcknowledgement(object(row.metadata)));
  if (acknowledged.length > 1) {
    throw new Error("SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS");
  }

  if (!acknowledged.length) {
    return ownerResult({
      organization,
      ownerPartyId: owner,
      scope: normalizedScope,
      at: evaluatedAt,
      reason: active.length ? "ACTIVE_COVERAGE_HANDOFF_NOT_ACKNOWLEDGED" : "NO_ACTIVE_COVERAGE",
      pendingCoverage: active[0] || null,
    });
  }

  const coverage = acknowledged[0];
  const metadata = object(coverage.metadata);
  const delegatePartyId = text(metadata.delegate_party_id, 120);
  const delegate = await one(
    supabaseAdmin.from("parties")
      .select("id,status")
      .eq("organization_id", organization)
      .eq("id", delegatePartyId)
      .maybeSingle(),
  );
  if (!delegate || text(delegate.status, 80).toUpperCase() !== "ACTIVE") {
    throw new Error("SECRETARY_ACTIVE_COVERAGE_DELEGATE_UNAVAILABLE");
  }

  return {
    status: "coverage_routing",
    contract: CONTRACT,
    organization_id: organization,
    scope: normalizedScope,
    evaluated_at: evaluatedAt,
    canonical_owner_party_id: owner,
    operational_assignee_party_id: delegatePartyId,
    coverage_applied: true,
    coverage_id: coverage.id,
    coverage_version: Number(metadata.version || 1),
    delegate_party_id: delegatePartyId,
    handoff_evidence_id: text(object(metadata.handoff_acknowledgement).evidence_id, 300),
    routing_reason: "ACKNOWLEDGED_ACTIVE_ADMINISTRATIVE_COVERAGE",
    coverage_requires_acknowledgement: true,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export function secretaryCoverageRoutingMetadata(routing = {}) {
  return {
    canonical_owner_party_id: routing.canonical_owner_party_id || null,
    operational_assignee_party_id: routing.operational_assignee_party_id || null,
    secretary_coverage_applied: routing.coverage_applied === true,
    secretary_coverage_id: routing.coverage_id || null,
    secretary_coverage_version: routing.coverage_version || null,
    secretary_coverage_scope: routing.scope || null,
    secretary_coverage_handoff_evidence_id: routing.handoff_evidence_id || null,
    secretary_coverage_routing_reason: routing.routing_reason || null,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  resolve: resolveSecretaryActiveCoverage,
  metadata: secretaryCoverageRoutingMetadata,
});
