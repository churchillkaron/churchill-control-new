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
  "avantiqo.creative.direction-attempt-replay.v1",
);

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

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function authorized(name) {
  return text(process.env[name]).toLowerCase() === "true";
}

function numberSet(value) {
  return new Set(
    text(value)
      .split(",")
      .map((entry) => integer(entry.trim()))
      .filter((entry) => entry !== null),
  );
}

function serviceResultFromUsage(usage = {}) {
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
    attempt_replay: true,
    attempt_replay_usage_id: usage.id || null,
    output: providerResult,
  };
}

let runtimeStatePromise = null;

async function loadState(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.metadata?.creative_project_id);
  const expectedApprovalId = text(
    process.env.CREATIVE_DIRECTION_REPLAY_APPROVAL_ID,
  );
  const expectedCommandIdentity = text(
    process.env.CREATIVE_DIRECTION_REPLAY_COMMAND_IDENTITY,
  );
  const startSequence = integer(
    process.env.CREATIVE_DIRECTION_REPLAY_START_SEQUENCE,
  );
  const endSequence = integer(
    process.env.CREATIVE_DIRECTION_REPLAY_END_SEQUENCE,
  );
  const skippedSequences = numberSet(
    process.env.CREATIVE_DIRECTION_REPLAY_SKIP_SEQUENCES,
  );

  if (!organizationId || !projectId) {
    throw new Error("CREATIVE_DIRECTION_ATTEMPT_REPLAY_SCOPE_REQUIRED");
  }
  if (!expectedApprovalId || !expectedCommandIdentity) {
    throw new Error("CREATIVE_DIRECTION_ATTEMPT_REPLAY_IDENTITY_REQUIRED");
  }
  if (
    startSequence === null ||
    endSequence === null ||
    startSequence <= 0 ||
    endSequence < startSequence
  ) {
    throw new Error("CREATIVE_DIRECTION_ATTEMPT_REPLAY_RANGE_INVALID");
  }

  const project = await CreativeProjectRuntime.get(projectId);
  if (
    !project ||
    text(project.organization_id) !== organizationId
  ) {
    throw new Error("CREATIVE_DIRECTION_ATTEMPT_REPLAY_PROJECT_SCOPE_INVALID");
  }
  if (
    text(project.metadata?.command_identity) !== expectedCommandIdentity
  ) {
    throw new Error(
      "CREATIVE_DIRECTION_ATTEMPT_REPLAY_COMMAND_IDENTITY_MISMATCH",
    );
  }

  const approval = object(project.metadata?.paid_direction_approval);
  if (
    approval.contract !== "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2" ||
    text(approval.id) !== expectedApprovalId
  ) {
    throw new Error("CREATIVE_DIRECTION_ATTEMPT_REPLAY_APPROVAL_MISMATCH");
  }

  const operations = list(approval.operations)
    .map((entry) => ({
      ...object(entry),
      sequence: integer(entry?.sequence),
      operation: text(entry?.operation).toUpperCase(),
      usage_id: text(entry?.usage_id),
    }))
    .filter((entry) =>
      entry.sequence !== null &&
      entry.sequence >= startSequence &&
      entry.sequence <= endSequence,
    )
    .sort((left, right) => left.sequence - right.sequence);

  const expectedLength = endSequence - startSequence + 1;
  if (operations.length !== expectedLength) {
    throw new Error(
      `CREATIVE_DIRECTION_ATTEMPT_REPLAY_LEDGER_COVERAGE_INVALID:${operations.length}:${expectedLength}`,
    );
  }

  for (let index = 0; index < operations.length; index += 1) {
    const expectedSequence = startSequence + index;
    const entry = operations[index];
    if (entry.sequence !== expectedSequence) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_SEQUENCE_GAP:${entry.sequence}:${expectedSequence}`,
      );
    }
    if (!entry.operation) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_OPERATION_REQUIRED:${entry.sequence}`,
      );
    }
    if (!skippedSequences.has(entry.sequence) && !entry.usage_id) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_USAGE_REQUIRED:${entry.sequence}`,
      );
    }
  }

  const usageRows = await UsageRuntime.organization(organizationId);
  const usageById = new Map(
    list(usageRows).map((row) => [text(row.id), row]),
  );

  for (const entry of operations) {
    if (skippedSequences.has(entry.sequence)) continue;
    const usage = usageById.get(entry.usage_id);
    if (!usage) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_USAGE_NOT_FOUND:${entry.sequence}:${entry.usage_id}`,
      );
    }
    if (text(usage.status).toUpperCase() !== "SUCCESS") {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_USAGE_NOT_SUCCESS:${entry.sequence}:${entry.usage_id}`,
      );
    }
    if (text(usage.category).toUpperCase() !== "CREATIVE_DIRECTION") {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_CATEGORY_INVALID:${entry.sequence}`,
      );
    }
    if (text(usage.metadata?.creative_project_id) !== projectId) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_PROJECT_MISMATCH:${entry.sequence}`,
      );
    }
    if (
      text(usage.metadata?.operation).toUpperCase() !== entry.operation
    ) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_OPERATION_LEDGER_MISMATCH:${entry.sequence}`,
      );
    }
    if (
      text(usage.metadata?.direction_approval_id) !== expectedApprovalId
    ) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_USAGE_APPROVAL_MISMATCH:${entry.sequence}`,
      );
    }
    if (!Object.keys(object(usage.metadata?.result)).length) {
      throw new Error(
        `CREATIVE_DIRECTION_ATTEMPT_REPLAY_RESULT_MISSING:${entry.sequence}`,
      );
    }
  }

  return {
    organizationId,
    projectId,
    approvalId: expectedApprovalId,
    operations,
    skippedSequences,
    usageById,
    cursor: 0,
    queue: Promise.resolve(),
  };
}

async function stateFor(input = {}) {
  if (!runtimeStatePromise) {
    runtimeStatePromise = loadState(input);
  }
  const state = await runtimeStatePromise;
  if (
    state.organizationId !== text(input.organization_id) ||
    state.projectId !== text(input.metadata?.creative_project_id)
  ) {
    throw new Error("CREATIVE_DIRECTION_ATTEMPT_REPLAY_SCOPE_CHANGED");
  }
  return state;
}

export function installCreativeDirectionAttemptReplay() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutReplay =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithAttemptReplay(input = {}) {
      if (
        text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
        !authorized("CREATIVE_DIRECTION_ATTEMPT_REPLAY_AUTHORIZED")
      ) {
        return executeWithoutReplay(input);
      }

      const state = await stateFor(input);
      const queued = state.queue.then(async () => {
        const operation = text(input.metadata?.operation).toUpperCase();
        const expected = state.operations[state.cursor] || null;

        if (!expected) {
          console.log(
            `CREATIVE_DIRECTION_ATTEMPT_REPLAY_COMPLETE_PASS_THROUGH=${operation}`,
          );
          return executeWithoutReplay(input);
        }

        if (operation !== expected.operation) {
          throw new Error(
            `CREATIVE_DIRECTION_ATTEMPT_REPLAY_OPERATION_MISMATCH:sequence=${expected.sequence};expected=${expected.operation};actual=${operation}`,
          );
        }

        state.cursor += 1;

        if (state.skippedSequences.has(expected.sequence)) {
          console.log(
            `CREATIVE_DIRECTION_ATTEMPT_REPLAY_SKIPPED=${expected.sequence}:${operation}`,
          );
          return executeWithoutReplay({
            ...input,
            metadata: {
              ...object(input.metadata),
              creative_direction_attempt_replay_skipped_sequence:
                expected.sequence,
              creative_direction_attempt_replay_source_approval_id:
                state.approvalId,
            },
          });
        }

        const usage = state.usageById.get(expected.usage_id);
        console.log(
          `CREATIVE_DIRECTION_ATTEMPT_REPLAY_RECOVERED=${expected.sequence}:${operation}:${usage.id}`,
        );
        return serviceResultFromUsage(usage);
      });

      state.queue = queued.then(
        () => null,
        () => null,
      );

      return queued;
    };
}

installCreativeDirectionAttemptReplay();

export const CreativeDirectionAttemptReplayRuntime = Object.freeze({
  installed: true,
});
