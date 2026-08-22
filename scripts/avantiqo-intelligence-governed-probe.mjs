import {
  ServiceExecutionRuntime,
} from "../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js";
import {
  resolveProviders,
} from "../lib/platform/service-runtime/providers/ProviderResolver.js";
import {
  getAvantiqoIntelligenceRuntimeConfiguration,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

const MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

function parseArguments(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return null;
  }
}

const runtimeConfiguration = getAvantiqoIntelligenceRuntimeConfiguration();
const providerPreflight = await resolveProviders({
  capability: "ai.reasoning.execute",
});
console.log(
  `AVANTIQO_GOVERNED_PREFLIGHT runtime_ready=${runtimeConfiguration.runtime_ready} engine_enabled=${runtimeConfiguration.engine_enabled} endpoint_configured=${runtimeConfiguration.endpoint_configured} api_key_configured=${runtimeConfiguration.api_key_configured} providers=${providerPreflight.providers.map((item) => item.id).join(",") || "none"} pricing=${providerPreflight.pricing.map((item) => `${item.provider}:${item.model || "none"}:${item.currency || "none"}`).join(",") || "none"} rejected_pricing=${providerPreflight.rejected_pricing.map((item) => `${item.provider}:${item.reason}`).join(",") || "none"}`,
);

const startedAt = Date.now();
const result = await ServiceExecutionRuntime.execute({
  organization_id: ORGANIZATION_ID,
  service_id: "ai.reasoning.execute",
  provider_id: "avantiqo-intelligence",
  capability: "ai.reasoning.execute",
  provider_policy: {
    allowed_providers: ["avantiqo-intelligence"],
  },
  input: {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: "Use the avantiqo_governed_probe tool exactly once with status set to ok. Do not invent a result.",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "avantiqo_governed_probe",
          description: "Certify the governed Avantiqo service runtime path.",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["ok"] },
            },
            required: ["status"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: { name: "avantiqo_governed_probe" },
    },
    temperature: 0,
    max_output_tokens: 256,
  },
  metadata: {
    module: "PLATFORM",
    operation: "AVANTIQO_INTELLIGENCE_GOVERNED_PROBE",
    diagnostic: true,
  },
  category: "AI",
});

const toolCalls = Array.isArray(result?.output?.output?.tool_calls)
  ? result.output.output.tool_calls
  : [];
const call = toolCalls[0] || null;
const args = parseArguments(call?.function?.arguments);
const passed = Boolean(
  result?.success === true &&
  result?.pending !== true &&
  result?.provider === "avantiqo-intelligence" &&
  call?.function?.name === "avantiqo_governed_probe" &&
  args?.status === "ok" &&
  result?.usage?.id &&
  result?.pricing?.pricing_id &&
  result?.wallet_settlement?.remaining_reserved_amount === 0
);

console.log(
  `AVANTIQO_GOVERNED_PROBE success=${passed} provider=${result?.provider || "none"} settlement=${result?.settlement || "none"} usage_id_present=${Boolean(result?.usage?.id)} pricing_id_present=${Boolean(result?.pricing?.pricing_id)} tool_call=${call?.function?.name || "none"} total_latency_ms=${Date.now() - startedAt}`,
);

if (!passed) {
  throw new Error("AVANTIQO_INTELLIGENCE_GOVERNED_SERVICE_RUNTIME_PROBE_FAILED");
}

console.log("AVANTIQO_INTELLIGENCE_GOVERNED_SERVICE_RUNTIME=PASS");
