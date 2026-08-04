import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.approved-production-task-cost-guard.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedGuard(value = {}) {
  const source = object(value);
  const maximumCustomerPrice = finite(
    source.maximum_customer_price ?? source.maximumCustomerPrice,
  );
  const currency = text(source.currency).toUpperCase();
  const reference = text(source.reference || source.budget_reference);
  const estimatedQuantity = finite(
    source.estimated_quantity ?? source.estimatedQuantity,
  );

  if (maximumCustomerPrice === null || maximumCustomerPrice <= 0) {
    throw new Error("APPROVED_PRODUCTION_TASK_MAXIMUM_PRICE_REQUIRED");
  }
  if (!currency) {
    throw new Error("APPROVED_PRODUCTION_TASK_CURRENCY_REQUIRED");
  }
  if (!reference) {
    throw new Error("APPROVED_PRODUCTION_TASK_COST_REFERENCE_REQUIRED");
  }
  if (estimatedQuantity !== null && estimatedQuantity <= 0) {
    throw new Error("APPROVED_PRODUCTION_TASK_QUANTITY_INVALID");
  }

  return {
    contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
    maximum_customer_price: maximumCustomerPrice,
    currency,
    reference,
    estimated_quantity: estimatedQuantity,
  };
}

function guardFromTask(task = {}) {
  return normalizedGuard(
    task.metadata?.approved_cost_guard ||
      task.input?.approved_cost_guard ||
      task.cost?.guard,
  );
}

function install() {
  if (runAIService[INSTALL_FLAG]) return;
  const executeWithoutApprovedTaskGuard = runAIService.execute.bind(runAIService);

  Object.defineProperty(runAIService, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  runAIService.execute = async function executeWithApprovedProductionCostGuard(
    input = {},
  ) {
    const taskId = text(input.metadata?.task_id);
    if (!taskId) return executeWithoutApprovedTaskGuard(input);

    const task = await ProductionTaskRuntime.get(taskId);
    if (!task) throw new Error("APPROVED_PRODUCTION_TASK_NOT_FOUND");

    const approvalContract = object(task.metadata?.production_approval_contract);
    if (
      approvalContract.contract !==
        "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1" ||
      approvalContract.production_authorized !== true ||
      approvalContract.publication_authorized !== false
    ) {
      throw new Error("SEALED_PRODUCTION_TASK_APPROVAL_CONTRACT_REQUIRED");
    }

    const guard = guardFromTask(task);
    return executeWithoutApprovedTaskGuard({
      ...input,
      cost_guard: guard,
      metadata: {
        ...object(input.metadata),
        approved_production_task_cost_guard_contract: guard.contract,
        approved_production_task_cost_guard_reference: guard.reference,
        approved_production_task_maximum_customer_price:
          guard.maximum_customer_price,
        approved_production_task_currency: guard.currency,
        sealed_approval_manifest_sha256:
          approvalContract.manifest_sha256 || null,
        sealed_preproduction_gate_sha256:
          approvalContract.preproduction_gate_sha256 || null,
      },
    });
  };
}

install();

export const CreativeApprovedProductionTaskCostGuardRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_APPROVED_PRODUCTION_TASK_COST_GUARD_V1",
  normalizedGuard,
  guardFromTask,
});
