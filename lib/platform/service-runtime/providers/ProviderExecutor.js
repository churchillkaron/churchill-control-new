import {
  executeProvider as executeProviderCore,
  getProviderStatus as getProviderStatusCore,
  loadProviderRuntime,
  prepareProviderInputForExecution,
} from "./ProviderExecutorCore";
import {
  withOwnedIntelligenceRequestLease,
} from "../execution/OwnedIntelligenceRequestLeaseRuntime";
import {
  withOwnedIntelligenceFastPodDistributedLease,
} from "../execution/OwnedIntelligenceFastPodLeaseRuntime";
import {
  requireAvantiqoIntelligenceSafeLease,
} from "./avantiqo-intelligence/AvantiqoIntelligenceSafeLeaseGuard";
import {
  executeAvantiqoIntelligenceFastPodProvider,
} from "./avantiqo-intelligence/AvantiqoIntelligenceFastPodProvider";
import {
  AvantiqoIntelligenceProvider,
  getAvantiqoIntelligenceRuntimeConfiguration,
} from "./avantiqo-intelligence/AvantiqoIntelligenceDeepProvider";

const OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence";
const INTELLIGENCE_CAPABILITY_DEFAULT_LANE = Object.freeze({
  "ai.text.generate": "fast",
  "ai.reasoning.execute": "deep",
});
const FAST_AVAILABILITY_RECOVERY_PATTERNS = Object.freeze([
  /AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ACQUIRE_FAILED/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_LEASE_ACQUIRE_INVALID/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_SHARED_VOLUME_BUSY/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_ENDPOINT_RESOLUTION_FAILED/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_COMPATIBLE_GPU_REQUIRED/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_TERMINAL/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_MODEL_READY_TIMEOUT/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_STARTUP_SPEND_LIMIT/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_HTTP_429/i,
  /AVANTIQO_INTELLIGENCE_FAST_POD_HTTP_5\d\d/i,
]);

function text(value) {
  return String(value ?? "").trim();
}

function canonicalSafeLeaseActive() {
  // A process-wide Safe Lease represents exactly one endpoint/lane. It is
  // valid for local/certification wrappers, but it must never override mixed
  // Fast + Deep customer traffic in production. Production always acquires a
  // request-scoped lease from OwnedIntelligenceRequestLeaseRuntime.
  if (text(process.env.NODE_ENV).toLowerCase() === "production") return false;
  return text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() === "YES";
}

function ownedIntelligenceExecutionLane(options = {}) {
  const explicit = text(
    options?.input?.execution_lane || options?.input?.executionLane,
  ).toLowerCase();
  if (explicit) return explicit;
  return INTELLIGENCE_CAPABILITY_DEFAULT_LANE[
    text(options?.capability || options?.input?.capability).toLowerCase()
  ] || "deep";
}

function inheritedOwnedIntelligenceSafeLeaseContext(options = {}) {
  const provider = text(options?.provider);
  if (provider !== OWNED_INTELLIGENCE_PROVIDER || !canonicalSafeLeaseActive()) {
    return null;
  }

  const executionLane = ownedIntelligenceExecutionLane(options);
  const guard = requireAvantiqoIntelligenceSafeLease(executionLane, null);

  return {
    intelligence_safe_lease_guard_contract: guard.contract,
    intelligence_safe_lease_contract: guard.safe_lease_contract,
    intelligence_safe_lease_safe_contract: guard.safe_lease_contract,
    intelligence_safe_lease_lane: guard.lease_lane,
    intelligence_safe_lease_endpoint_id: guard.endpoint_id,
    intelligence_safe_lease_expires_at: guard.expires_at,
    intelligence_request_lease_mode: "INHERITED_CANONICAL_SAFE_LEASE",
    intelligence_request_lease_scaling_performed: false,
  };
}

function directOwnedFastPodExecution(options = {}) {
  return (
    text(options?.provider) === OWNED_INTELLIGENCE_PROVIDER &&
    ownedIntelligenceExecutionLane(options) === "fast"
  );
}

function fastAvailabilityRecoveryEligible(error, options = {}) {
  if (!directOwnedFastPodExecution(options)) return false;
  const source = text(error?.message || error);
  if (!source) return false;
  return FAST_AVAILABILITY_RECOVERY_PATTERNS.some((pattern) => pattern.test(source));
}

async function recoverOwnedFastThroughDeep(options = {}, fastError = null) {
  const organizationId = text(options?.context?.organization_id);
  if (!organizationId) {
    throw fastError || new Error("AVANTIQO_INTELLIGENCE_FAST_DEEP_RECOVERY_ORGANIZATION_REQUIRED");
  }

  const deepModel = text(getAvantiqoIntelligenceRuntimeConfiguration().model);
  const recoveryInput = {
    ...(options?.input && typeof options.input === "object" ? options.input : {}),
    execution_lane: "deep",
    model: deepModel,
  };

  const result = await withOwnedIntelligenceRequestLease({
    provider: OWNED_INTELLIGENCE_PROVIDER,
    organizationId,
    capability: "ai.reasoning.execute",
    payload: recoveryInput,
    execute: async (leaseContext = {}) => AvantiqoIntelligenceProvider.execute({
      ...recoveryInput,
      context: {
        ...(options?.context && typeof options.context === "object" ? options.context : {}),
        ...(leaseContext && typeof leaseContext === "object" ? leaseContext : {}),
      },
    }),
  });

  if (result && typeof result === "object") {
    result.output = {
      ...(result.output && typeof result.output === "object" ? result.output : {}),
      execution_lane: "deep",
      availability_recovery: {
        contract: "AVANTIQO_OWNED_INTELLIGENCE_AVAILABILITY_RECOVERY_V1",
        from_lane: "fast",
        to_lane: "deep",
        owned_provider_only: true,
        external_fallback_used: false,
        trigger: text(fastError?.message || fastError).split(":")[0] || "FAST_UNAVAILABLE",
      },
    };
  }
  return result;
}

function attachProviderLatency(value, latencyMs) {
  if (!value || typeof value !== "object") return value;
  Object.defineProperty(value, "__provider_latency_ms", {
    value: Math.max(0, Number(latencyMs) || 0),
    enumerable: false,
    configurable: true,
  });
  return value;
}

function attachProviderErrorContext(error, options, latencyMs) {
  if (error && typeof error === "object") {
    const metadata = {
      __provider_latency_ms: Math.max(0, Number(latencyMs) || 0),
      __provider_id: String(options?.provider || "").trim() || null,
      __provider_capability: String(options?.capability || "").trim() || null,
    };

    for (const [key, value] of Object.entries(metadata)) {
      Object.defineProperty(error, key, {
        value,
        enumerable: false,
        configurable: true,
      });
    }
  }
  return error;
}

export async function executeProvider(options = {}) {
  const startedAt = Date.now();
  try {
    const executeCore = async (leaseContext = {}) => executeProviderCore({
      ...options,
      context: {
        ...(options?.context && typeof options.context === "object" ? options.context : {}),
        ...(leaseContext && typeof leaseContext === "object" ? leaseContext : {}),
      },
    });

    let result = null;
    if (directOwnedFastPodExecution(options)) {
      // Fast Serverless scheduling has been retired. Never inherit or open a
      // Fast Serverless Safe Lease here: doing so can recreate a paid 0/1
      // endpoint plus queued job while simultaneously making the Pod runtime
      // fail its required 0/0 baseline. Fast now owns one transport only: the
      // governed ephemeral Pod runtime under the distributed Fast lane lease.
      if (canonicalSafeLeaseActive()) {
        throw new Error("AVANTIQO_INTELLIGENCE_FAST_CANONICAL_SAFE_LEASE_FORBIDDEN");
      }
      try {
        result = await withOwnedIntelligenceFastPodDistributedLease({
          organizationId: options?.context?.organization_id || null,
          execute: async (podLeaseContext = {}) => executeAvantiqoIntelligenceFastPodProvider({
            ...options,
            context: {
              ...(options?.context && typeof options.context === "object" ? options.context : {}),
              ...(podLeaseContext && typeof podLeaseContext === "object" ? podLeaseContext : {}),
            },
          }),
        });
      } catch (fastError) {
        if (!fastAvailabilityRecoveryEligible(fastError, options)) throw fastError;
        result = await recoverOwnedFastThroughDeep(options, fastError);
      }
    } else {
      const inheritedSafeLease = inheritedOwnedIntelligenceSafeLeaseContext(options);
      if (inheritedSafeLease) {
        result = await executeCore(inheritedSafeLease);
      } else {
        result = await withOwnedIntelligenceRequestLease({
          provider: String(options?.provider || "").trim(),
          organizationId: options?.context?.organization_id || null,
          capability: text(options?.capability || options?.input?.capability),
          payload: options?.input || {},
          execute: executeCore,
        });
      }
    }

    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorContext(error, options, Date.now() - startedAt);
  }
}

export async function getProviderStatus(options = {}) {
  const startedAt = Date.now();
  try {
    const result = await getProviderStatusCore(options);
    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorContext(error, options, Date.now() - startedAt);
  }
}

export {
  loadProviderRuntime,
  prepareProviderInputForExecution,
};

export const ProviderExecutor = {
  executeProvider,
  getProviderStatus,
  loadProviderRuntime,
  prepareProviderInputForExecution,
};
