import {
  AvantiqoIntelligenceProvider,
} from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceDeepProvider.js";
import {
  AvantiqoIntelligenceFastProvider,
} from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceFastProvider.js";
import { requireAvantiqoIntelligenceSafeLease } from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceSafeLeaseGuard.js";

export const AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_CONTRACT =
  "AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function providerForLane(lane) {
  const normalized = text(lane, 40).toLowerCase();
  if (normalized === "deep") return AvantiqoIntelligenceProvider;
  if (normalized === "fast") return AvantiqoIntelligenceFastProvider;
  throw new Error(
    `AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_LANE_INVALID:${normalized || "NONE"}`,
  );
}

export function inspectAvantiqoSpecialistBenchmarkProviderAdapter(input = {}) {
  const lane = text(input.lane, 40).toLowerCase();
  const provider = providerForLane(lane);
  return {
    contract: AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_CONTRACT,
    lane,
    provider_id: provider.id,
    executes_existing_provider: true,
    opens_safe_lease: false,
    scales_runpod: false,
    mutates_wallet: false,
    deploys_production: false,
    raw_reasoning_persisted: false,
  };
}

export async function executeAvantiqoSpecialistBenchmarkProvider({
  lane,
  provider_input: providerInput,
} = {}) {
  const normalizedLane = text(lane, 40).toLowerCase();
  const input = object(providerInput);
  const context = object(input.context);
  const lease = requireAvantiqoIntelligenceSafeLease(normalizedLane, context);
  const provider = providerForLane(normalizedLane);

  if (text(input.execution_lane, 40).toLowerCase() !== normalizedLane) {
    throw new Error(
      `AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_INPUT_LANE_MISMATCH:adapter=${normalizedLane}:input=${text(input.execution_lane, 40).toLowerCase() || "NONE"}`,
    );
  }

  const result = await provider.execute(input);
  const output = object(result?.output);
  const reportedLane = text(output.execution_lane, 40).toLowerCase();
  if (reportedLane && reportedLane !== normalizedLane) {
    throw new Error(
      `AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_OUTPUT_LANE_MISMATCH:expected=${normalizedLane}:observed=${reportedLane}`,
    );
  }

  return {
    ...result,
    execution_lane: normalizedLane,
    benchmark_adapter: {
      contract: AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_CONTRACT,
      safe_lease_guard_contract: lease.contract,
      safe_lease_contract: lease.safe_lease_contract,
      lease_lane: lease.lease_lane,
      endpoint_id: lease.endpoint_id,
      opens_safe_lease: false,
      scales_runpod: false,
      mutates_wallet: false,
      deploys_production: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoSpecialistBenchmarkProviderAdapter = Object.freeze({
  contract: AVANTIQO_SPECIALIST_BENCHMARK_PROVIDER_ADAPTER_CONTRACT,
  inspect: inspectAvantiqoSpecialistBenchmarkProviderAdapter,
  execute: executeAvantiqoSpecialistBenchmarkProvider,
});
