import assert from "node:assert/strict";
import { executeCodeAIPlannerRequest } from "../lib/code/runtime/CodeAIPlannerExecutionRuntime.js";

const originalNodeEnv = process.env.NODE_ENV;

function completedServiceRuntime(capture) {
  return {
    async execute(input) {
      capture.push(input);
      return {
        success: true,
        pending: false,
        provider: input.provider_id || "test-provider",
        model: "test-model",
        output: {
          result: JSON.stringify({ action: "complete", description: "done", input: {} }),
        },
      };
    },
    async settle() {
      throw new Error("settle must not be called for immediate test completion");
    },
  };
}

try {
  process.env.NODE_ENV = "development";
  const developmentCalls = [];
  await executeCodeAIPlannerRequest({
    execution_input: {
      organization_id: "00000000-0000-0000-0000-000000000001",
      service_id: "ai.code.debug",
      capability: "ai.code.debug",
      input: {
        instruction: "Choose the next bounded Code action.",
        quantity: 1,
      },
      metadata: { code_ai_test: true },
    },
    service_runtime: completedServiceRuntime(developmentCalls),
  });

  assert.equal(developmentCalls.length, 1);
  const local = developmentCalls[0];
  assert.equal(local.provider_id, "avantiqo-code");
  assert.deepEqual(local.provider_policy?.allowed_providers, ["avantiqo-code"]);
  assert.equal(local.provider_policy?.execution_scope, "BENCHMARK_REVIEW_PREVIEW");
  assert.equal(local.provider_policy?.benchmark_only, true);
  assert.equal(local.provider_policy?.owned_only_required, true);
  assert.equal(local.provider_policy?.external_fallback_allowed, false);
  assert.deepEqual(local.provider_policy?.benchmark_pricing_estimate, {
    input_tokens: 32768,
    output_tokens: 4096,
  });
  assert.equal(local.metadata?.production_certified, false);
  assert.equal(local.metadata?.local_development_owned_code_preview, true);
  assert.equal(local.metadata?.pricing_estimate_max_input_tokens, 32768);
  assert.equal(local.metadata?.pricing_estimate_max_output_tokens, 4096);
  assert.equal(local.input?.instructions, "Choose the next bounded Code action.");

  process.env.NODE_ENV = "production";
  const productionCalls = [];
  await executeCodeAIPlannerRequest({
    execution_input: {
      organization_id: "00000000-0000-0000-0000-000000000001",
      service_id: "ai.code.debug",
      capability: "ai.code.debug",
      input: {
        instruction: "Choose the next bounded Code action.",
        quantity: 1,
      },
      metadata: { code_ai_test: true },
    },
    service_runtime: completedServiceRuntime(productionCalls),
  });

  assert.equal(productionCalls.length, 1);
  const production = productionCalls[0];
  assert.equal(production.provider_id, undefined);
  assert.equal(production.provider_policy, undefined);
  assert.equal(production.metadata?.local_development_owned_code_preview, undefined);
  assert.equal(production.metadata?.production_certified, undefined);

  console.log("AVANTIQO_CODE_PLANNER_OWNED_PREVIEW_CONTRACT=PASS");
} finally {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
}
