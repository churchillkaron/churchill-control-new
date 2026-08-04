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
  "avantiqo.creative.direction-completed-replay.v1",
);

const EXPECTED_SUPPLEMENT_OPERATIONS = Object.freeze([
  "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1",
  "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
  "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
]);

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

function authorized(name) {
  return text(process.env[name]).toLowerCase() === "true";
}

function serviceResultFromUsage(usage = {}, approvalId = "") {
  const providerResult = object(usage.metadata?.result);
  return {
    success: true,
    pending: false,
    provider: usage.provider || providerResult.provider || null,
    model: usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    settlement: "CHARGED",
    completed_replay: true,
    completed_replay_approval_id: approvalId || null,
    completed_replay_usage_id: usage.id || null,
    output: providerResult,
  };
}

function normalizedOperations(approval = {}) {
  return list(approval.operations)
    .map((entry) => ({
      ...object(entry),
      sequence: Number(entry?.sequence),
      operation: text(entry?.operation).toUpperCase(),
      usage_id: text(entry?.usage_id),
    }))
    .sort((left, right) => left.sequence - right.sequence);
}

function validateCompletedApproval({
  approval,
  expectedId,
  expectedCommandIdentity,
  expectedCallCount,
  label,
}) {
  if (
    approval.contract !== "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2" ||
    text(approval.id) !== expectedId ||
    text(approval.command_identity) !== expectedCommandIdentity ||
    text(approval.status).toUpperCase() !== "COMPLETED" ||
    approval.approved !== false ||
    Number(approval.call_count) !== expectedCallCount ||
    Number(approval.maximum_calls) !== expectedCallCount
  ) {
    throw new Error(
      `CREATIVE_DIRECTION_COMPLETED_REPLAY_${label}_APPROVAL_INVALID`,
    );
  }

  const operations = normalizedOperations(approval);
  if (operations.length !== expectedCallCount) {
    throw new Error(
      `CREATIVE_DIRECTION_COMPLETED_REPLAY_${label}_LEDGER_COUNT_INVALID:${operations.length}:${expectedCallCount}`,
    );
  }

  for (let index = 0; index < operations.length; index += 1) {
    const expectedSequence = index + 1;
    const entry = operations[index];
    if (
      entry.sequence !== expectedSequence ||
      !entry.operation ||
      !entry.usage_id
    ) {
      throw new Error(
        `CREATIVE_DIRECTION_COMPLETED_REPLAY_${label}_LEDGER_ENTRY_INVALID:${expectedSequence}`,
      );
    }
  }

  return operations;
}

let statePromise = null;

async function loadState(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const sourceApprovalId = text(
    process.env.CREATIVE_DIRECTION_COMPLETED_REPLAY_SOURCE_APPROVAL_ID,
  );
  const supplementApprovalId = text(
    process.env.CREATIVE_DIRECTION_COMPLETED_REPLAY_SUPPLEMENT_APPROVAL_ID,
  );
  const commandIdentity = text(
    process.env.CREATIVE_DIRECTION_COMPLETED_REPLAY_COMMAND_IDENTITY,
  );

  if (
    !organizationId ||
    !projectId ||
    !sourceApprovalId ||
    !supplementApprovalId ||
    !commandIdentity
  ) {
    throw new Error(
      "CREATIVE_DIRECTION_COMPLETED_REPLAY_SCOPE_REQUIRED",
    );
  }
  if (sourceApprovalId === supplementApprovalId) {
    throw new Error(
      "CREATIVE_DIRECTION_COMPLETED_REPLAY_APPROVAL_ISOLATION_REQUIRED",
    );
  }

  const project = await CreativeProjectRuntime.get(projectId);
  if (
    !project ||
    text(project.organization_id) !== organizationId ||
    text(project.metadata?.command_identity) !== commandIdentity
  ) {
    throw new Error(
      "CREATIVE_DIRECTION_COMPLETED_REPLAY_PROJECT_SCOPE_INVALID",
    );
  }

  const sourceApproval = object(
    project.metadata?.paid_direction_replay_source,
  );
  const activeApproval = object(
    project.metadata?.paid_direction_approval,
  );
  const history = list(
    project.metadata?.paid_direction_approval_history,
  );
  const supplementApproval =
    text(activeApproval.id) === supplementApprovalId
      ? activeApproval
      : object(
          history.find(
            (entry) => text(entry?.id) === supplementApprovalId,
          ),
        );

  const sourceOperations = validateCompletedApproval({
    approval: sourceApproval,
    expectedId: sourceApprovalId,
    expectedCommandIdentity: commandIdentity,
    expectedCallCount: 20,
    label: "SOURCE",
  });
  const supplementOperations = validateCompletedApproval({
    approval: supplementApproval,
    expectedId: supplementApprovalId,
    expectedCommandIdentity: commandIdentity,
    expectedCallCount: 3,
    label: "SUPPLEMENT",
  });

  if (
    text(supplementApproval.source_approval_id) !== sourceApprovalId
  ) {
    throw new Error(
      "CREATIVE_DIRECTION_COMPLETED_REPLAY_SUPPLEMENT_SOURCE_MISMATCH",
    );
  }

  const supplementNames = supplementOperations.map(
    (entry) => entry.operation,
  );
  if (
    JSON.stringify(supplementNames) !==
    JSON.stringify(EXPECTED_SUPPLEMENT_OPERATIONS)
  ) {
    throw new Error(
      `CREATIVE_DIRECTION_COMPLETED_REPLAY_SUPPLEMENT_OPERATIONS_INVALID:${JSON.stringify(supplementNames)}`,
    );
  }

  const replayEntries = [
    ...sourceOperations.slice(0, 15).map((entry) => ({
      ...entry,
      approval_id: sourceApprovalId,
      source_sequence: entry.sequence,
    })),
    ...supplementOperations.map((entry, index) => ({
      ...entry,
      approval_id: supplementApprovalId,
      source_sequence: index === 0 ? 16 : null,
    })),
  ];

  if (replayEntries.length !== 18) {
    throw new Error(
      `CREATIVE_DIRECTION_COMPLETED_REPLAY_ENTRY_COUNT_INVALID:${replayEntries.length}:18`,
    );
  }

  const usageRows = await UsageRuntime.organization(organizationId);
  const usageById = new Map(
    list(usageRows).map((row) => [text(row.id), row]),
  );

  for (let index = 0; index < replayEntries.length; index += 1) {
    const entry = replayEntries[index];
    const usage = usageById.get(entry.usage_id);
    if (!usage) {
      throw new Error(
        `CREATIVE_DIRECTION_COMPLETED_REPLAY_USAGE_NOT_FOUND:${index + 1}:${entry.usage_id}`,
      );
    }
    if (
      text(usage.status).toUpperCase() !== "SUCCESS" ||
      text(usage.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
      text(usage.metadata?.creative_project_id) !== projectId ||
      text(usage.metadata?.operation).toUpperCase() !== entry.operation ||
      text(usage.metadata?.direction_approval_id) !== entry.approval_id ||
      !Object.keys(object(usage.metadata?.result)).length
    ) {
      throw new Error(
        `CREATIVE_DIRECTION_COMPLETED_REPLAY_USAGE_INVALID:${index + 1}:${entry.usage_id}`,
      );
    }
  }

  return {
    organizationId,
    projectId,
    replayEntries,
    usageById,
    cursor: 0,
    queue: Promise.resolve(),
  };
}

async function stateFor(input = {}) {
  if (!statePromise) statePromise = loadState(input);
  const state = await statePromise;
  if (
    state.organizationId !== text(input.organization_id) ||
    state.projectId !== text(input.metadata?.creative_project_id)
  ) {
    throw new Error(
      "CREATIVE_DIRECTION_COMPLETED_REPLAY_SCOPE_CHANGED",
    );
  }
  return state;
}

export function installCreativeDirectionCompletedReplay() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutReplay =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithCompletedReplay(input = {}) {
      if (
        text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
        !authorized("CREATIVE_DIRECTION_COMPLETED_REPLAY_AUTHORIZED")
      ) {
        return executeWithoutReplay(input);
      }

      const state = await stateFor(input);
      const queued = state.queue.then(async () => {
        const operation = text(input.metadata?.operation).toUpperCase();
        const expected = state.replayEntries[state.cursor] || null;

        if (!expected) {
          throw new Error(
            `CREATIVE_DIRECTION_COMPLETED_REPLAY_UNEXPECTED_ADDITIONAL_CALL:${operation}`,
          );
        }
        if (operation !== expected.operation) {
          throw new Error(
            `CREATIVE_DIRECTION_COMPLETED_REPLAY_OPERATION_MISMATCH:call=${state.cursor + 1};expected=${expected.operation};actual=${operation}`,
          );
        }

        state.cursor += 1;
        const usage = state.usageById.get(expected.usage_id);
        console.log(
          `CREATIVE_DIRECTION_COMPLETED_REPLAY_RECOVERED=${state.cursor}:${operation}:${usage.id}`,
        );
        return serviceResultFromUsage(
          usage,
          expected.approval_id,
        );
      });

      state.queue = queued.then(
        () => null,
        () => null,
      );

      return queued;
    };
}

installCreativeDirectionCompletedReplay();

export const CreativeDirectionCompletedReplayRuntime = Object.freeze({
  installed: true,
  expected_call_count: 18,
});
