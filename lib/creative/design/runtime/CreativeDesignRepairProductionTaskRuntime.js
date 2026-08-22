import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  validateCreativeDesignDocument,
} from "../contracts/CreativeDesignDocumentContract.js";
import {
  repairCreativeDesignUntilStable,
} from "./CreativeDesignRepairRuntime.js";

const CONTRACT = "CREATIVE_DESIGN_REPAIR_PRODUCTION_TASK_RUNTIME_V1";
const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.design.repair-production-task-runtime.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function capability(task = {}) {
  return text(task.capability || task.service_code || task.service_id).toLowerCase();
}

function unwrapDocument(value, depth = 0) {
  if (!value || depth > 8) return null;
  if (value.contract === "CREATIVE_DESIGN_DOCUMENT_V1" && Array.isArray(value.pages)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = unwrapDocument(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const child of [
    value.design_document,
    value.structured_design_document,
    value.document,
    value.output,
    value.result,
    ...Object.values(value),
  ]) {
    const found = unwrapDocument(child, depth + 1);
    if (found) return found;
  }
  return null;
}

async function documentForTask(task) {
  const direct = unwrapDocument(task.input);
  if (direct) return validateCreativeDesignDocument(direct);
  for (const dependencyId of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(dependencyId);
    const found = unwrapDocument(dependency?.output);
    if (found) return validateCreativeDesignDocument(found);
  }
  throw new Error("CREATIVE_DESIGN_REPAIR_DOCUMENT_REQUIRED");
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const previousDispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCreativeDesignRepair(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || capability(task) !== "creative.design.repair") {
      return previousDispatch(id);
    }
    if (task.status === "COMPLETED" || task.status === "FAILED") return task;

    await ProductionTaskRuntime.update(id, {
      status: "RUNNING",
      timing: {
        ...(task.timing || {}),
        started_at: task.timing?.started_at || new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        local_design_repair_execution: true,
        bounded_repair: true,
        locked_node_mutation_allowed: false,
        business_truth_mutation_allowed: false,
        provider_selection_exposed: false,
        wallet_charge_required: false,
      },
    });

    try {
      const document = await documentForTask(task);
      const repaired = repairCreativeDesignUntilStable(document, {
        maximum_passes:
          task.input?.maximum_passes ||
          task.input?.repair_policy?.maximum_passes ||
          task.metadata?.repair_policy?.maximum_passes,
        render_options: object(task.input?.render_options),
      });

      if (!repaired.success) {
        const error = new Error(`CREATIVE_DESIGN_REPAIR_BLOCKED:${repaired.status}`);
        error.validation = repaired;
        return ProductionTaskRuntime.fail(id, error, {
          provider: "avantiqo-local-design-repair-worker",
          settlement: "LOCAL_EXECUTION_FAILED",
          output: repaired,
        });
      }

      return ProductionTaskRuntime.complete(id, {
        provider: "avantiqo-local-design-repair-worker",
        settlement: "LOCAL_EXECUTION",
        pricing: null,
        usage: null,
        billing: null,
        output: {
          ...repaired,
          design_document: repaired.document,
        },
      });
    } catch (error) {
      return ProductionTaskRuntime.fail(id, error, {
        provider: "avantiqo-local-design-repair-worker",
        settlement: "LOCAL_EXECUTION_FAILED",
      });
    }
  };
}

install();

export const CreativeDesignRepairProductionTaskRuntime = Object.freeze({
  contract: CONTRACT,
  installed: true,
  capability: "creative.design.repair",
  local_execution: true,
  bounded_repair: true,
  provider_called: false,
  wallet_charge_required: false,
});

export default CreativeDesignRepairProductionTaskRuntime;
