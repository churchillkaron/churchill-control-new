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

if (!configuration.endpoint_configured) {
  fail("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_MISSING");
}
if (!configuration.api_key_configured) {
  fail("RUNPOD_API_KEY_MISSING");
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
      model_match: probe.model_match,
      served_models: probe.served_models,
      structured_output_ok: probe.structured_output_ok,
      finish_reason: probe.finish_reason,
      completion_latency_ms: probe.completion_latency_ms,
      total_latency_ms: probe.total_latency_ms,
      usage: probe.usage,
      models_probe_error: probe.models_probe_error,
    });
  }
  if (probe.model_match === false) {
    fail("SERVED_MODEL_MISMATCH", {
      configured_model: probe.configured_model,
      served_models: probe.served_models,
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
