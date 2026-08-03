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
  "avantiqo.creative.direction-completed-budget-recovery.v2",
);
const AUTHORIZATION_CONTRACT =
  "CREATIVE_DIRECTION_CUMULATIVE_AUTHORIZATION_V1";
const RECOVERY_CONTRACT =
  "CREATIVE_DIRECTION_COMPLETED_BUDGET_RECOVERY_V2";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessions = new Map();

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

function operationOf(usage = {}) {
  return text(usage.metadata?.operation).toUpperCase();
}

function timestamp(usage = {}) {
  const value = Date.parse(
    usage.created_at || usage.updated_at || 0,
  );
  return Number.isFinite(value) ? value : 0;
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
    signature: [
      requiredCalls,
      ...approvalIds,
    ].join(":"),
  };
}

function validCandidate({
  usage,
  organizationId,
  projectId,
  approvalIds,
}) {
  return Boolean(
    usage &&
    uuid(usage.id) &&
    text(usage.organization_id) === organizationId &&
    text(usage.status).toUpperCase() === "SUCCESS" &&
    text(usage.category).toUpperCase() === "CREATIVE_DIRECTION" &&
    text(usage.metadata?.creative_project_id) === projectId &&
    operationOf(usage) &&
    approvalIds.has(uuid(usage.metadata?.direction_approval_id)) &&
    Object.keys(object(usage.metadata?.result)).length
  );
}

function chronological(rows = []) {
  return [...rows].sort((left, right) =>
    timestamp(left) - timestamp(right) ||
    text(left.id).localeCompare(text(right.id)),
  );
}

function coherentWindows({
  eligible,
  firstOperation,
  requiredCalls,
}) {
  const windows = [];

  for (let start = 0; start < eligible.length; start += 1) {
    if (operationOf(eligible[start]) !== firstOperation) continue;

    const usages = eligible.slice(start, start + requiredCalls);
    if (usages.length !== requiredCalls) continue;

    const repeatedStart = usages
      .slice(1)
      .some((usage) => operationOf(usage) === firstOperation);
    if (repeatedStart) continue;

    windows.push({
      start,
      usages,
      started_at: usages[0]?.created_at || null,
      completed_at:
        usages[usages.length - 1]?.created_at || null,
    });
  }

  return windows;
}

async function buildRecoverySession({
  organizationId,
  projectId,
  firstOperation,
  authorization,
}) {
  const candidates = await UsageRuntime.creativeDirectionByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
    operation: null,
    ascending: true,
    limit: 250,
  });
  const eligible = chronological(
    list(candidates).filter((usage) =>
      validCandidate({
        usage,
        organizationId,
        projectId,
        approvalIds: authorization.approvalIds,
      }),
    ),
  );

  if (eligible.length < authorization.requiredCalls) {
    throw new Error(
      `CREATIVE_DIRECTION_RECOVERY_COHERENT_WINDOW_MISSING:` +
      `eligible=${eligible.length};required=${authorization.requiredCalls};` +
      `first_operation=${firstOperation}`,
    );
  }

  const windows = coherentWindows({
    eligible,
    firstOperation,
    requiredCalls: authorization.requiredCalls,
  });
  const selected = windows[windows.length - 1] || null;

  if (!selected) {
    throw new Error(
      `CREATIVE_DIRECTION_RECOVERY_COHERENT_WINDOW_MISSING:` +
      `eligible=${eligible.length};required=${authorization.requiredCalls};` +
      `first_operation=${firstOperation};candidate_windows=0`,
    );
  }

  return {
    contract: RECOVERY_CONTRACT,
    authorization_signature: authorization.signature,
    first_operation: firstOperation,
    cursor: 0,
    usages: selected.usages,
    eligible_count: eligible.length,
    candidate_window_count: windows.length,
    window_start_usage_id: selected.usages[0]?.id || null,
    window_end_usage_id:
      selected.usages[selected.usages.length - 1]?.id || null,
    window_started_at: selected.started_at,
    window_completed_at: selected.completed_at,
  };
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

  const key = `${organizationId}:${projectId}`;
  let session = sessions.get(key) || null;
  if (!session) {
    session = await buildRecoverySession({
      organizationId,
      projectId,
      firstOperation: operation,
      authorization,
    });
    sessions.set(key, session);
  }

  if (session.authorization_signature !== authorization.signature) {
    throw new Error(
      "CREATIVE_DIRECTION_RECOVERY_AUTHORIZATION_CHANGED_DURING_EXECUTION",
    );
  }
  if (session.cursor >= session.usages.length) {
    throw new Error(
      `CREATIVE_DIRECTION_RECOVERY_COHERENT_WINDOW_EXHAUSTED:` +
      `required=${authorization.requiredCalls};` +
      `next_operation=${operation}`,
    );
  }

  const sequence = session.cursor + 1;
  const selected = session.usages[session.cursor];
  const expectedOperation = operationOf(selected);
  if (expectedOperation !== operation) {
    throw new Error(
      `CREATIVE_DIRECTION_RECOVERY_WINDOW_OPERATION_MISMATCH:` +
      `sequence=${sequence};expected=${expectedOperation};actual=${operation};` +
      `window_start=${session.window_start_usage_id};` +
      `window_end=${session.window_end_usage_id}`,
    );
  }

  session.cursor += 1;
  sessions.set(key, session);

  return serviceResultFromUsage(selected, {
    contract: RECOVERY_CONTRACT,
    cumulative_authorization_contract: AUTHORIZATION_CONTRACT,
    authorized_calls: authorization.authorizedCalls,
    required_calls: authorization.requiredCalls,
    approval_ids: [...authorization.approvalIds],
    recovered_usage_id: selected.id,
    recovered_approval_id: selected.metadata?.direction_approval_id || null,
    operation,
    sequence,
    eligible_usage_count: session.eligible_count,
    candidate_window_count: session.candidate_window_count,
    window_start_usage_id: session.window_start_usage_id,
    window_end_usage_id: session.window_end_usage_id,
    window_started_at: session.window_started_at,
    window_completed_at: session.window_completed_at,
    coherent_global_call_window_required: true,
    operation_sequence_match_required: true,
    repeated_first_operation_inside_window_prohibited: true,
    exact_request_hash_required: false,
    project_and_authorized_approval_scope_required: true,
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
