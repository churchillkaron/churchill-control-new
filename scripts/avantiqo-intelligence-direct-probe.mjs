import {
  getAvantiqoIntelligenceEndpointHealth,
  probeAvantiqoIntelligenceRuntime,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const health = await getAvantiqoIntelligenceEndpointHealth();
const running = n(health?.workers?.running);
const idle = n(health?.workers?.idle);
const queued = n(health?.jobs?.inQueue);
const inProgress = n(health?.jobs?.inProgress);

console.log(
  `AVANTIQO_DIRECT_PROBE_HEALTH latency_ms=${health.latency_ms} workers_running=${running} workers_idle=${idle} jobs_in_queue=${queued} jobs_in_progress=${inProgress}`,
);

if (running + idle < 1) {
  throw new Error("AVANTIQO_INTELLIGENCE_NO_WARM_WORKER");
}

const probe = await probeAvantiqoIntelligenceRuntime({ health });
console.log(
  `AVANTIQO_DIRECT_PROBE_RESULT success=${probe.success} structured_output=${probe.structured_output_ok} native_tool_call=${probe.native_tool_call_ok} reasoning_transport_detected=${probe.reasoning_transport_detected} completion_latency_ms=${probe.completion_latency_ms} tool_latency_ms=${probe.tool_latency_ms} total_latency_ms=${probe.total_latency_ms} input_tokens=${probe.usage?.input_tokens || 0} output_tokens=${probe.usage?.output_tokens || 0}`,
);

if (!probe.success) {
  throw new Error("AVANTIQO_INTELLIGENCE_DIRECT_PROBE_FAILED");
}

console.log("AVANTIQO_INTELLIGENCE_DIRECT_PROBE=PASS");
