import {
  getAvantiqoIntelligenceEndpointHealth,
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
  const health = await getAvantiqoIntelligenceEndpointHealth();
  console.log(
    `AVANTIQO_INTELLIGENCE_HEALTH=PASS latency_ms=${health.latency_ms} workers_running=${Number(health.workers?.running || 0)} workers_idle=${Number(health.workers?.idle || 0)} jobs_in_progress=${Number(health.jobs?.inProgress || 0)} jobs_in_queue=${Number(health.jobs?.inQueue || 0)} jobs_failed=${Number(health.jobs?.failed || 0)}`,
  );

  const probe = await probeAvantiqoIntelligenceRuntime({ health });

  if (probe.health_probe_ok !== true) {
    fail("ENDPOINT_HEALTH_FAILED", {
      health_latency_ms: probe.health_latency_ms,
      health_workers: probe.health_workers,
      health_jobs: probe.health_jobs,
    });
  }

  if (probe.structured_output_ok !== true) {
    fail("STRUCTURED_OUTPUT_FAILED", {
      configured_model: probe.configured_model,
      finish_reason: probe.finish_reason,
      completion_latency_ms: probe.completion_latency_ms,
      usage: probe.usage,
      runpod_worker_requirements: {
        REASONING_PARSER: "qwen3",
        ENABLE_AUTO_TOOL_CHOICE: "true",
        TOOL_CALL_PARSER: "hermes",
      },
    });
  }

  if (probe.native_tool_call_ok !== true) {
    fail("NATIVE_TOOL_CALL_FAILED", {
      tool_finish_reason: probe.tool_finish_reason,
      tool_latency_ms: probe.tool_latency_ms,
      tool_usage: probe.tool_usage,
      runpod_worker_requirements: {
        REASONING_PARSER: "qwen3",
        ENABLE_AUTO_TOOL_CHOICE: "true",
        TOOL_CALL_PARSER: "hermes",
      },
    });
  }

  if (probe.raw_reasoning_persisted !== false) {
    fail("RAW_REASONING_PERSISTENCE_POLICY_FAILED");
  }

  if (probe.success !== true) {
    fail("RUNTIME_HANDSHAKE_FAILED", {
      configured_model: probe.configured_model,
      model_verified_by_completion: probe.model_verified_by_completion,
      structured_output_ok: probe.structured_output_ok,
      native_tool_call_ok: probe.native_tool_call_ok,
      reasoning_transport_detected: probe.reasoning_transport_detected,
      finish_reason: probe.finish_reason,
      tool_finish_reason: probe.tool_finish_reason,
      completion_latency_ms: probe.completion_latency_ms,
      tool_latency_ms: probe.tool_latency_ms,
      total_latency_ms: probe.total_latency_ms,
      usage: probe.usage,
      tool_usage: probe.tool_usage,
    });
  }

  console.log(
    `AVANTIQO_INTELLIGENCE_RELEASE_AUDIT=PASS model=${probe.configured_model} health=${probe.health_probe_ok} structured_output=${probe.structured_output_ok} native_tool_call=${probe.native_tool_call_ok} reasoning_transport_detected=${probe.reasoning_transport_detected} completion_latency_ms=${probe.completion_latency_ms} tool_latency_ms=${probe.tool_latency_ms} input_tokens=${probe.usage.input_tokens} output_tokens=${probe.usage.output_tokens}`,
  );
} catch (error) {
  fail("RUNTIME_PROBE_ERROR", {
    error: String(error?.message || error).slice(0, 1500),
    runpod_worker_requirements: {
      REASONING_PARSER: "qwen3",
      ENABLE_AUTO_TOOL_CHOICE: "true",
      TOOL_CALL_PARSER: "hermes",
    },
  });
}
