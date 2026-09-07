import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeWorldConsistencyRuntime } from "@/lib/creative/world/runtime/CreativeWorldConsistencyRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.world-consistency-execution-gate.v1");

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function visualTask(task = {}) {
  const capability = text(task.capability || task.service_code || task.service_id).toLowerCase();
  const type = text(task.type).toUpperCase();
  return capability.includes("video") || capability.includes("image") || /SHOT|VIDEO|IMAGE|TEMPORAL/.test(type);
}

function worldContract(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const candidate =
    input.world_consistency_contract ||
    requirements.world_consistency_contract ||
    task.metadata?.world_consistency_contract_data ||
    null;
  return object(candidate);
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutWorldGate = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithWorldConsistencyGate(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !visualTask(task)) return dispatchWithoutWorldGate(id);
    const contract = worldContract(task);
    if (!Object.keys(contract).length) {
      throw new Error("CREATIVE_WORLD_PREAUTHORED_CONTRACT_REQUIRED");
    }
    const verified = CreativeWorldConsistencyRuntime.assertReady({
      ...object(task.input),
      world_consistency_contract: contract,
      metadata: {
        ...object(task.input?.metadata),
        ...object(task.metadata),
      },
    });
    await ProductionTaskRuntime.update(id, {
      metadata: {
        ...object(task.metadata),
        world_consistency_contract: verified.contract,
        world_consistency_contract_data: verified.world_consistency_contract,
        world_consistency_contract_hash: verified.world_consistency_contract.contract_hash,
        world_consistency_world_id: verified.world_consistency_contract.world_id,
        world_consistency_status: verified.status,
        world_consistency_verified_before_dispatch: true,
        world_consistency_execution_authored: false,
        world_consistency_provider_neutral: true,
      },
    });
    return dispatchWithoutWorldGate(id);
  };
}

install();

export const CreativeWorldConsistencyExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_WORLD_CONSISTENCY_EXECUTION_GATE_V1",
  world_consistency_contract: CreativeWorldConsistencyRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
  fail_closed: true,
});
