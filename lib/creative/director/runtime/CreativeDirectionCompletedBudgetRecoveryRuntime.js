import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction-completed-budget-recovery.v1",
);
const AUTHORIZATION_CONTRACT =
  "CREATIVE_DIRECTION_CUMULATIVE_AUTHORIZATION_V1";
const REPEATABLE_OPERATIONS = new Set([
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cursors = new Map();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function uuid(value) {
  const candidate = text(value);
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

function recoveryAuthorization(project = {}) {
  const metadata = object(project.metadata);
  const cumulative = object(metadata.direction_cumulative_authorization);
  const current = object(metadata.paid_direction_approval);
  const authorizedCalls = Number(cumulative.authorized_calls || 0);
  const requiredCalls = Number(cumulative.required_calls || 0);

  if (
    cumulative.contract !== AUTHORIZATION_CONTRACT ||
    cumulative.sufficient !== true ||
    cumulative.recovery_only !== true ||
    cumulative.new_provider_execution_authorized !== false ||
    !Number.isFinite(authorizedCalls) ||
    !Number.isFinite(requiredCalls) ||
    requiredCalls <= 0 ||
    authorizedCalls < requiredCalls ||
    current.recovery_only !== true ||
    text(current.status).toUpperCase() !== "COMPLETED"
  ) {
    return null;
  }

  const approvalIds = new Set(
    list(cumulative.approval_ids)
      .map(uuid)
      .filter(Boolean),
  );
  if (!approvalIds.size) return null;

  return {
    metadata,
    cumulative,
    current,
    approvalIds,
    authorizedCalls,
    requiredCalls,
  };
}

function validCandidate({
  usage,
  organizationId,
  projectId,
  operation,
  approvalIds,
}) {
  return Boolean(
    usage &&
    uuid(usage.id) &&
    text(usage.organization_id) === organizationId &&
    text(usage.status).toUpperCase() === "SUCCESS" &&
    text(usage.category).toUpperCase() === "CREATIVE_DIRECTION" &&
    text(usage.metadata?.creative_project_id) === projectId &&
    text(usage.metadata?.operation).toUpperCase() === operation &&
    approvalIds.has(uuid(usage.metadata?.direction_approval_id)) &&
    Object.keys(object(usage.metadata?.result)).length
  );
}

function serviceResultFromUsage(usage = {}, evidence = {}) {
  const providerResult = object(usage.metadata?.result);
  const recoveredUsage = {
    ...usage,
    metadata: {
      ...object(usage.metadata),
      completed_budget_recovery: evidence,
    },
  };

  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult.provider || null,
    model: usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage: recoveredUsage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage: recoveredUsage,
    },
    settlement: "RECOVERED_PREVIOUSLY_CHARGED_USAGE",
    output: providerResult,
    completed_budget_recovery: evidence,
  };
}

async function recoverCompletedBudgetUsage(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const operation = text(input.metadata?.operation).toUpperCase();
  if (!organizationId || !projectId || !operation) return null;

  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || text(project.organization_id) !== organizationId) {
    return null;
  }

  const authorization = recoveryAuthorization(project);
  if (!authorization) return null;

  const repeatable = REPEATABLE_OPERATIONS.has(operation);
  const candidates = await UsageRuntime.creativeDirectionByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
    operation,
    ascending: repeatable,
    limit: 250,
  });
  const eligible = list(candidates).filter((usage) =>
    validCandidate({
      usage,
      organizationId,
      projectId,
      operation,
      approvalIds: authorization.approvalIds,
    }),
  );

  const key = `${organizationId}:${projectId}:${operation}`;
  const cursor = Number(cursors.get(key) || 0);
  const selected = repeatable
    ? eligible[cursor] || null
    : eligible[0] || null;

  if (!selected) {
    throw new Error(
      `CREATIVE_DIRECTION_RECOVERY_ONLY_USAGE_MISSING:${operation}:` +
      `eligible=${eligible.length}:sequence=${repeatable ? cursor + 1 : 1}`,
    );
  }

  if (repeatable) cursors.set(key, cursor + 1);

  return serviceResultFromUsage(selected, {
    contract: "CREATIVE_DIRECTION_COMPLETED_BUDGET_RECOVERY_V1",
    cumulative_authorization_contract: AUTHORIZATION_CONTRACT,
    authorized_calls: authorization.authorizedCalls,
    required_calls: authorization.requiredCalls,
    approval_ids: [...authorization.approvalIds],
    recovered_usage_id: selected.id,
    recovered_approval_id: selected.metadata?.direction_approval_id || null,
    operation,
    sequence: repeatable ? cursor + 1 : 1,
    candidate_count: eligible.length,
    exact_request_hash_required: false,
    project_and_operation_scope_required: true,
    original_provider_result_reused: true,
    downstream_structure_reconciliation_allowed:
      operation === "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
    new_provider_execution: false,
    new_customer_charge: false,
    media_generation_authorized: false,
    publication_authorized: false,
  });
}

export function installCreativeDirectionCompletedBudgetRecovery() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutCompletedBudgetRecovery =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithCompletedBudgetRecovery(input = {}) {
      if (text(input.category).toUpperCase() !== "CREATIVE_DIRECTION") {
        return executeWithoutCompletedBudgetRecovery(input);
      }

      const recovered = await recoverCompletedBudgetUsage(input);
      return recovered || executeWithoutCompletedBudgetRecovery(input);
    };
}

installCreativeDirectionCompletedBudgetRecovery();

export const CreativeDirectionCompletedBudgetRecoveryRuntime = {
  installed: true,
};
