import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.direction-json-contract.v1",
);

const JSON_OPERATIONS = new Set([
  "TEMPORAL_MASTER_PLAN_BASE_V1",
  "TEMPORAL_SCENE_ARCHITECTURE_V1",
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function installCreativeDirectionJsonContract() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutJsonContract = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithJsonContract(
    input = {},
  ) {
    const operation = text(input.metadata?.operation).toUpperCase();
    if (
      text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
      !JSON_OPERATIONS.has(operation)
    ) {
      return executeWithoutJsonContract(input);
    }

    const payload = object(input.input);
    const existingFormat =
      payload.response_format ||
      payload.responseFormat ||
      payload.text?.format ||
      null;

    return executeWithoutJsonContract({
      ...input,
      input: {
        ...payload,
        response_format:
          existingFormat || { type: "json_object" },
      },
      metadata: {
        ...object(input.metadata),
        creative_direction_json_contract:
          "CREATIVE_DIRECTION_JSON_CONTRACT_V1",
        creative_direction_json_contract_injected:
          !existingFormat,
      },
    });
  };
}

installCreativeDirectionJsonContract();

export const CreativeDirectionJsonContractRuntime = {
  installed: true,
  operations: [...JSON_OPERATIONS],
};
