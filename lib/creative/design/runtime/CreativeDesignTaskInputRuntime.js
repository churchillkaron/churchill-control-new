import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.design.task-input.v1");

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalize(data = {}) {
  const capability = text(data.capability || data.service_code || data.service_id);
  if (!capability.startsWith("creative.design.")) return data;

  const input = object(data.input);
  const requirements = object(input.requirements);
  const normalized = {
    ...data,
    input: {
      ...input,
    },
  };

  if (capability === "creative.design.data.bind") {
    normalized.input.governed_sources = object(
      input.governed_sources ||
      input.data_sources ||
      requirements.governed_sources,
    );
  }

  if (capability === "creative.design.compose") {
    normalized.input.design_specification = object(
      input.design_specification ||
      input.structured_specification ||
      requirements.design_specification,
    );
  }

  return normalized;
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const originalCreate = ProductionTaskRuntime.create.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
  });
  ProductionTaskRuntime.create = async function createWithDesignInput(data = {}) {
    return originalCreate(normalize(data));
  };
}

install();

export const CreativeDesignTaskInputRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_DESIGN_TASK_INPUT_V1",
  normalize,
});
