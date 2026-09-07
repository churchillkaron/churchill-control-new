import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeVfxRuntime,
} from "@/lib/creative/vfx/runtime/CreativeVfxRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.vfx-execution-gate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function vfxRequested(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const contract =
    input.vfx_contract ||
    requirements.vfx_contract ||
    task.metadata?.vfx_contract;
  const requested =
    input.vfx ||
    requirements.vfx ||
    task.metadata?.vfx;
  return Boolean(
    (contract && (typeof contract !== "object" || Object.keys(contract).length)) ||
    (requested && (typeof requested !== "object" || Object.keys(requested).length || Array.isArray(requested))),
  );
}

function visualTask(task = {}) {
  const capability = text(task.capability || task.service_code || task.service_id).toLowerCase();
  const type = text(task.type).toUpperCase();
  return capability.includes("video") || capability.includes("image") || /SHOT|VIDEO|IMAGE|TEMPORAL/.test(type);
}

function verificationInput(task = {}) {
  const input = object(task.input);
  const requirements = object(input.requirements);
  const contract =
    input.vfx_contract ||
    requirements.vfx_contract ||
    task.metadata?.vfx_contract_data ||
    null;
  return {
    ...input,
    vfx: input.vfx || requirements.vfx || task.metadata?.vfx || null,
    vfx_contract: contract,
    capability: task.capability || task.service_code || task.service_id || null,
    metadata: {
      ...object(input.metadata),
      ...object(task.metadata),
    },
    execution_phase: "PROVIDER_DISPATCH_VERIFICATION",
  };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const dispatchWithoutVfxGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithVfxGate(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task || !visualTask(task) || !vfxRequested(task)) {
      return dispatchWithoutVfxGate(id);
    }

    const verified = CreativeVfxRuntime.assertReady(verificationInput(task));
    if (verified.status === "READY") {
      await ProductionTaskRuntime.update(id, {
        metadata: {
          ...object(task.metadata),
          vfx_contract: verified.contract,
          vfx_contract_data: verified.vfx_contract,
          vfx_status: verified.status,
          vfx_effect_count: verified.vfx_contract?.effects?.length || 0,
          vfx_warning_count: verified.warnings.length,
          vfx_verified_before_dispatch: true,
          vfx_execution_authored: false,
          vfx_provider_neutral: true,
        },
      });
    }

    return dispatchWithoutVfxGate(id);
  };
}

install();

export const CreativeVfxExecutionGate = Object.freeze({
  installed: true,
  contract: "AVANTIQO_VFX_EXECUTION_GATE_V1",
  vfx_contract: CreativeVfxRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
  fail_closed: true,
});
