import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
  secretaryCoverageScopeForStep,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_JOB_COVERAGE_EXECUTION_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function secretaryJobCanonicalOwnerPartyId(job = {}) {
  return text(object(job.metadata).canonical_owner_party_id || job.requested_by_party_id, 120) || null;
}

export function secretaryJobExactApprovalOwnedByCanonicalOwner(job = {}, step = {}) {
  const ownerPartyId = secretaryJobCanonicalOwnerPartyId(job);
  const approval = object(object(step.metadata).approval);
  if (!ownerPartyId) return false;
  return text(approval.approved_by_party_id, 120) === ownerPartyId;
}

export async function resolveSecretaryJobStepExecutionCoverage({
  job = {},
  step = {},
  at = null,
  highAuthority = false,
} = {}) {
  const organizationId = text(job.organization_id, 120);
  if (!organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  const canonicalOwnerPartyId = await resolveSecretaryCanonicalOwner({ organizationId, job });
  if (!canonicalOwnerPartyId) throw new Error("SECRETARY_COVERAGE_ROUTING_OWNER_PARTY_REQUIRED");
  const scope = secretaryCoverageScopeForStep(job, step);
  const ownerAuthorityRequired = highAuthority === true
    || step.requires_approval === true
    || text(step.status, 80).toUpperCase() === "APPROVAL_REQUIRED"
    || text(step.action_type, 80).toUpperCase() === "REVIEW"
    || object(object(step.metadata).approval).granted === true;

  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId: canonicalOwnerPartyId,
    scope,
    instruction: step.instruction || job.objective,
    step,
    at,
    requiresOwnerAuthority: ownerAuthorityRequired,
  });

  const explicitTargetPartyId = text(step.target_party_id, 120) || null;
  return {
    ...routing,
    contract: CONTRACT,
    scope,
    canonical_owner_party_id: canonicalOwnerPartyId,
    operational_assignee_party_id: text(routing.operational_assignee_party_id, 120) || canonicalOwnerPartyId,
    execution_actor_party_id: text(routing.operational_assignee_party_id, 120) || canonicalOwnerPartyId,
    artifact_owner_party_id: explicitTargetPartyId || canonicalOwnerPartyId,
    explicit_target_party_id: explicitTargetPartyId,
    explicit_target_assignment_preserved: Boolean(explicitTargetPartyId),
    owner_authority_required: ownerAuthorityRequired,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export function secretaryJobExecutionCoverageMetadata(routing = {}) {
  return {
    ...secretaryAdministrativeCoverageMetadata(routing),
    secretary_job_coverage_execution_contract: CONTRACT,
    secretary_coverage_scope: routing.scope || null,
    canonical_owner_party_id: routing.canonical_owner_party_id || null,
    operational_assignee_party_id: routing.operational_assignee_party_id || null,
    secretary_job_execution_actor_party_id: routing.execution_actor_party_id || null,
    secretary_job_artifact_owner_party_id: routing.artifact_owner_party_id || null,
    explicit_target_party_id: routing.explicit_target_party_id || null,
    explicit_target_assignment_preserved: routing.explicit_target_assignment_preserved === true,
    secretary_owner_authority_required: routing.owner_authority_required === true,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  resolve: resolveSecretaryJobStepExecutionCoverage,
  metadata: secretaryJobExecutionCoverageMetadata,
  canonicalOwnerPartyId: secretaryJobCanonicalOwnerPartyId,
  exactApprovalOwnedByCanonicalOwner: secretaryJobExactApprovalOwnedByCanonicalOwner,
});
