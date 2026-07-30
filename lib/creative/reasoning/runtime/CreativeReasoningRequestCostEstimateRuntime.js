import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative-reasoning-request-cost-estimate.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function promptCharacters(input = {}) {
  const value =
    input.input?.prompt ??
    input.input?.input ??
    input.input?.messages ??
    "";
  return typeof value === "string"
    ? value.length
    : JSON.stringify(value || "").length;
}

function estimate(input = {}) {
  const characters = promptCharacters(input);
  const requestedOutputTokens = finite(
    input.input?.max_output_tokens ?? input.input?.maxOutputTokens,
  );
  if (requestedOutputTokens === null || requestedOutputTokens <= 0) {
    throw new Error("CREATIVE_REASONING_COST_ESTIMATE_OUTPUT_TOKENS_REQUIRED");
  }
  const quantity = finite(input.input?.quantity) ?? 1;
  if (quantity <= 0) {
    throw new Error("CREATIVE_REASONING_COST_ESTIMATE_QUANTITY_INVALID");
  }

  return {
    contract: "CREATIVE_REASONING_REQUEST_COST_ESTIMATE_V1",
    prompt_characters: characters,
    estimated_input_tokens: Math.max(1, Math.ceil(characters / 3) + 512),
    estimated_output_tokens: Math.floor(requestedOutputTokens),
    estimated_quantity: quantity,
    method: "CONSERVATIVE_UTF16_CHARACTERS_DIVIDED_BY_3_PLUS_512",
  };
}

function install() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutEstimate = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithReasoningEstimate(input = {}) {
    const governed =
      input.service_id === "ai.reasoning.execute" &&
      input.category === "CREATIVE_DIRECTION";
    if (!governed) return executeWithoutEstimate(input);

    const usageEstimate = estimate(input);
    return executeWithoutEstimate({
      ...input,
      cost_guard: {
        ...object(input.cost_guard || input.costGuard),
        estimated_input_tokens: usageEstimate.estimated_input_tokens,
        estimated_output_tokens: usageEstimate.estimated_output_tokens,
        estimated_quantity: usageEstimate.estimated_quantity,
      },
      metadata: {
        ...object(input.metadata),
        creative_reasoning_cost_estimate_contract: usageEstimate.contract,
        creative_reasoning_prompt_characters:
          usageEstimate.prompt_characters,
        creative_reasoning_estimated_input_tokens:
          usageEstimate.estimated_input_tokens,
        creative_reasoning_estimated_output_tokens:
          usageEstimate.estimated_output_tokens,
        creative_reasoning_estimated_quantity:
          usageEstimate.estimated_quantity,
      },
    });
  };
}

install();

export const CreativeReasoningRequestCostEstimateRuntime = {
  installed: true,
  estimate,
};
