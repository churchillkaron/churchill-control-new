import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryActiveCoverage,
  secretaryCoverageRoutingMetadata,
} from "@/lib/operator/secretary/SecretaryCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_ADMINISTRATIVE_COVERAGE_ROUTING_V1";
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
const ACTION_SCOPE = Object.freeze({
  CALL: "FOLLOW_UP_COORDINATION",
  MESSAGE: "FOLLOW_UP_COORDINATION",
  EMAIL: "FOLLOW_UP_COORDINATION",
  CREATE_EVENT: "CALENDAR_COORDINATION",
  CREATE_TASK: "TASK_ROUTING",
  RESEARCH: "TASK_ROUTING",
  DISCOVER_CONTACTS: "TASK_ROUTING",
  OTHER: "TASK_ROUTING",
  REVIEW: "TASK_ROUTING",
});
const JOB_KIND_SCOPE = Object.freeze({
  TRAVEL_COORDINATION: "TRAVEL_COORDINATION",
  MEETING_COORDINATION: "MEETING_COORDINATION",
  VISITOR_COORDINATION: "VISITOR_COORDINATION",
  DOCUMENT_COORDINATION: "DOCUMENT_COORDINATION",
  DOCUMENT_FILING: "DOCUMENT_COORDINATION",
  DEADLINE_COORDINATION: "DEADLINE_COORDINATION",
  EXPENSE_ADMINISTRATION: "EXPENSE_ADMINISTRATION",
  EXPENSE_PACK: "EXPENSE_ADMINISTRATION",
});
const OWNER_AUTHORITY_PATTERN = /\b(payment|pay\b|purchase|buy\b|order\b|contract|sign\b|signature|legal|binding|approval|approve|authorize|bank transfer|refund|credential|password|secret|api key|accept(?:ing)?\s+(?:a\s+)?(?:fare|rate|quote|quotation|terms)|book(?:ing)?\s+(?:a\s+)?(?:flight|hotel|room|ticket|transport)|reserve\s+(?:a\s+)?(?:flight|hotel|room|ticket|transport))\b/i;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

function normalizedScope(value) {
  const scope = text(value, 120).toUpperCase();
  return ALLOWED_SCOPES.has(scope) ? scope : null;
}

async function settingsOwner(organizationId) {
  const settings = await one(
    supabaseAdmin.from("secretary_settings")
      .select("booking_policy,metadata")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  );
  return text(object(settings?.booking_policy).owner_party_id || object(settings?.metadata).owner_party_id, 120) || null;
}

export async function resolveSecretaryCanonicalOwner({ organizationId, ownerPartyId = null, job = null, followUp = null } = {}) {
  const organization = text(organizationId || job?.organization_id || followUp?.organization_id, 120);
  if (!organization) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  const explicit = text(
    ownerPartyId ||
      object(followUp?.metadata).canonical_owner_party_id ||
      followUp?.owner_party_id ||
      object(job?.metadata).canonical_owner_party_id ||
      job?.requested_by_party_id,
    120,
  );
  return explicit || settingsOwner(organization);
}

export function secretaryCoverageScopeForJob(job = {}) {
  const metadata = object(job.metadata);
  const explicit = normalizedScope(metadata.secretary_coverage_scope);
  if (explicit) return explicit;
  const jobKind = text(metadata.job_kind, 120).toUpperCase();
  return JOB_KIND_SCOPE[jobKind] || "TASK_ROUTING";
}

export function secretaryCoverageScopeForStep(job = {}, step = {}) {
  const stepMetadata = object(step.metadata);
  const explicitStep = normalizedScope(stepMetadata.secretary_coverage_scope);
  if (explicitStep) return explicitStep;
  const jobMetadata = object(job.metadata);
  const explicitJob = normalizedScope(jobMetadata.secretary_coverage_scope);
  if (explicitJob) return explicitJob;
  const jobKind = text(jobMetadata.job_kind, 120).toUpperCase();
  if (JOB_KIND_SCOPE[jobKind]) return JOB_KIND_SCOPE[jobKind];
  return ACTION_SCOPE[text(step.action_type, 80).toUpperCase()] || "TASK_ROUTING";
}

export function secretaryCoverageScopeForFollowUp(followUp = {}, job = null) {
  const metadata = object(followUp.metadata);
  const explicit = normalizedScope(metadata.secretary_coverage_scope);
  if (explicit) return explicit;
  if (job) {
    const jobMetadata = object(job.metadata);
    const explicitJob = normalizedScope(jobMetadata.secretary_coverage_scope);
    if (explicitJob) return explicitJob;
    const jobKind = text(jobMetadata.job_kind, 120).toUpperCase();
    if (JOB_KIND_SCOPE[jobKind]) return JOB_KIND_SCOPE[jobKind];
  }
  return "FOLLOW_UP_COORDINATION";
}

function ownerAuthorityRequired({ instruction, step = null, explicit = false } = {}) {
  if (explicit === true) return true;
  if (step?.requires_approval === true) return true;
  if (text(step?.status, 80).toUpperCase() === "APPROVAL_REQUIRED") return true;
  if (object(object(step?.metadata).approval).granted === true) return true;
  return OWNER_AUTHORITY_PATTERN.test(text(instruction || step?.instruction, 5000));
}

function failClosedOwnerRouting({ organizationId, ownerPartyId, scope, at, reason }) {
  return {
    status: "owner_routing_review_required",
    contract: CONTRACT,
    organization_id: organizationId,
    scope,
    evaluated_at: at,
    canonical_owner_party_id: ownerPartyId,
    operational_assignee_party_id: ownerPartyId,
    coverage_applied: false,
    coverage_id: null,
    coverage_version: null,
    delegate_party_id: null,
    handoff_evidence_id: null,
    routing_reason: reason,
    coverage_requires_acknowledgement: true,
    coverage_routing_review_required: true,
    coverage_routing_fail_closed: true,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export async function resolveSecretaryAdministrativeCoverage({
  organizationId,
  ownerPartyId,
  scope,
  instruction = null,
  step = null,
  at = null,
  requiresOwnerAuthority = false,
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  const owner = text(ownerPartyId, 120);
  if (!owner) throw new Error("SECRETARY_COVERAGE_ROUTING_OWNER_PARTY_REQUIRED");
  const normalized = normalizedScope(scope);
  if (!normalized) throw new Error(`SECRETARY_COVERAGE_ROUTING_SCOPE_FORBIDDEN:${text(scope, 120).toUpperCase()}`);
  const evaluatedAt = at && Number.isFinite(Date.parse(String(at))) ? new Date(at).toISOString() : new Date().toISOString();
  const ownerRequired = ownerAuthorityRequired({ instruction, step, explicit: requiresOwnerAuthority });

  try {
    const routing = await resolveSecretaryActiveCoverage({
      context: {
        organizationId: organization,
        actor: { partyId: owner },
        metadata: { partyId: owner },
      },
      ownerPartyId: owner,
      scope: normalized,
      at: evaluatedAt,
      requiresOwnerAuthority: ownerRequired,
    });
    return {
      ...routing,
      contract: CONTRACT,
      owner_authority_required: ownerRequired,
      coverage_routing_review_required: false,
      coverage_routing_fail_closed: false,
    };
  } catch (error) {
    const message = text(error?.message || error, 500);
    if (["SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS", "SECRETARY_ACTIVE_COVERAGE_DELEGATE_UNAVAILABLE"].includes(message)) {
      return {
        ...failClosedOwnerRouting({
          organizationId: organization,
          ownerPartyId: owner,
          scope: normalized,
          at: evaluatedAt,
          reason: message,
        }),
        owner_authority_required: ownerRequired,
      };
    }
    throw error;
  }
}

export async function resolveSecretaryJobCoverage({ job = {}, step = null, at = null } = {}) {
  const organizationId = text(job.organization_id, 120);
  const ownerPartyId = await resolveSecretaryCanonicalOwner({ organizationId, job });
  if (!ownerPartyId) throw new Error("SECRETARY_COVERAGE_ROUTING_OWNER_PARTY_REQUIRED");
  const scope = step ? secretaryCoverageScopeForStep(job, step) : secretaryCoverageScopeForJob(job);
  return resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId,
    scope,
    instruction: step?.instruction || job.objective,
    step,
    at,
  });
}

export async function resolveSecretaryFollowUpCoverage({ followUp = {}, execution = null, job = null, step = null, at = null } = {}) {
  const organizationId = text(followUp.organization_id || execution?.organization_id, 120);
  const ownerPartyId = await resolveSecretaryCanonicalOwner({ organizationId, job, followUp });
  if (!ownerPartyId) throw new Error("SECRETARY_COVERAGE_ROUTING_OWNER_PARTY_REQUIRED");
  const scope = secretaryCoverageScopeForFollowUp(followUp, job);
  const metadata = object(followUp.metadata);
  const instruction = text(
    metadata.execution_instruction || execution?.instruction || followUp.reason || step?.instruction,
    5000,
  );
  return resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId,
    scope,
    instruction,
    step,
    at,
    requiresOwnerAuthority: metadata.requires_owner_authority === true,
  });
}

export function secretaryAdministrativeCoverageMetadata(routing = {}) {
  return {
    ...secretaryCoverageRoutingMetadata(routing),
    secretary_administrative_coverage_contract: CONTRACT,
    secretary_coverage_routing_review_required: routing.coverage_routing_review_required === true,
    secretary_coverage_routing_fail_closed: routing.coverage_routing_fail_closed === true,
    secretary_owner_authority_required: routing.owner_authority_required === true,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  resolve: resolveSecretaryAdministrativeCoverage,
  resolveJob: resolveSecretaryJobCoverage,
  resolveFollowUp: resolveSecretaryFollowUpCoverage,
  metadata: secretaryAdministrativeCoverageMetadata,
});
