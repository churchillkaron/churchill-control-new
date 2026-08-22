import {
  getAvantiqoIntelligenceRuntimeConfiguration,
  probeAvantiqoIntelligenceRuntime,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

function fail(message, details = null) {
  console.error(`AVANTIQO_INTELLIGENCE_RELEASE_AUDIT=FAIL reason=${message}`);
  if (details) console.error(JSON.stringify(details));
  process.exit(1);
}

const configuration = getAvantiqoIntelligenceRuntimeConfiguration();

console.log(
  `AVANTIQO_INTELLIGENCE_CONFIGURATION engine_enabled=${configuration.engine_enabled} endpoint_configured=${configuration.endpoint_configured} api_key_configured=${configuration.api_key_configured} model=${configuration.model}`,
);

if (!configuration.engine_enabled) {
  fail("AVANTIQO_INTELLIGENCE_ENGINE_NOT_ENABLED");
}
if (!configuration.endpoint_configured) {
  fail("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_MISSING");
}
if (!configuration.api_key_configured) {
  fail("RUNPOD_API_KEY_MISSING");
}
if (!configuration.runtime_ready) {
  fail("AVANTIQO_INTELLIGENCE_RUNTIME_NOT_READY");
}
if (configuration.model !== "Qwen/Qwen3-30B-A3B-Thinking-2507") {
  fail("UNEXPECTED_INTELLIGENCE_MODEL", {
    configured_model: configuration.model,
  });
}

try {
  const probe = await probeAvantiqoIntelligenceRuntime();
  if (probe.success !== true) {
    fail("RUNTIME_HANDSHAKE_FAILED", {
      configured_model: probe.configured_model,
      model_verified_by_completion: probe.model_verified_by_completion,
      structured_output_ok: probe.structured_output_ok,
      finish_reason: probe.finish_reason,
      completion_latency_ms: probe.completion_latency_ms,
      total_latency_ms: probe.total_latency_ms,
      usage: probe.usage,
    });
  }

  console.log(
    `AVANTIQO_INTELLIGENCE_RELEASE_AUDIT=PASS model=${probe.configured_model} structured_output=${probe.structured_output_ok} latency_ms=${probe.completion_latency_ms} input_tokens=${probe.usage.input_tokens} output_tokens=${probe.usage.output_tokens}`,
  );
} catch (error) {
  fail("RUNTIME_PROBE_ERROR", {
    error: String(error?.message || error).slice(0, 1500),
  });
}
