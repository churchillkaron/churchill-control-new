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
  isAvantiqoIntelligenceFastUnscheduledError,
} from "../execution/OwnedIntelligenceFastPodFallbackRuntime";
import {
  executeAvantiqoIntelligenceFastPodProvider,
} from "./avantiqo-intelligence/AvantiqoIntelligenceFastPodProvider";
import {
  requireAvantiqoIntelligenceSafeLease,
} from "./avantiqo-intelligence/AvantiqoIntelligenceSafeLeaseGuard";

const OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence";
const INTELLIGENCE_CAPABILITY_DEFAULT_LANE = Object.freeze({
  "ai.text.generate": "fast",
  "ai.reasoning.execute": "deep",
});

function text(value) {
  return String(value ?? "").trim();
}

function ownedIntelligenceModalConfigured(options = {}) {
  if (text(options?.provider) !== OWNED_INTELLIGENCE_PROVIDER) return false;
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  return Boolean(tokenId && tokenSecret);
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

function directOwnedFastExecution(options = {}) {
  return (
    text(options?.provider) === OWNED_INTELLIGENCE_PROVIDER &&
    ownedIntelligenceExecutionLane(options) === "fast"
  );
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

async function executeRequestScopedOwnedIntelligence(options, executeCore) {
  try {
    return await withOwnedIntelligenceRequestLease({
      provider: String(options?.provider || "").trim(),
      organizationId: options?.context?.organization_id || null,
      capability: text(options?.capability || options?.input?.capability),
      payload: options?.input || {},
      execute: executeCore,
    });
  } catch (error) {
    if (
      !directOwnedFastExecution(options) ||
      !isAvantiqoIntelligenceFastUnscheduledError(error)
    ) {
      throw error;
    }

    // The request-scoped Serverless lease has already parked and released its
    // endpoint before this boundary is reached. Only the exact bounded
    // unscheduled Fast condition may switch to the owned ephemeral Pod lane.
    // This is not an external/model fallback: it preserves the same provider,
    // model, customer usage record and fail-closed pricing lineage.
    return withOwnedIntelligenceFastPodDistributedLease({
      organizationId: options?.context?.organization_id || null,
      execute: async (podLeaseContext = {}) => executeAvantiqoIntelligenceFastPodProvider({
        ...options,
        context: {
          ...(options?.context && typeof options.context === "object" ? options.context : {}),
          ...(podLeaseContext && typeof podLeaseContext === "object" ? podLeaseContext : {}),
        },
      }),
    });
  }
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

    // Modal is a fully separate owned scale-to-zero infrastructure path.
    // The same direct Modal SDK credentials used by Audio are authoritative.
    // Direct Modal: do not touch RunPod at all.
    // RunPod Safe Lease remains mandatory only when direct Modal is absent and
    // the canonical RunPod fallback is selected.
    const result = ownedIntelligenceModalConfigured(options)
      ? await executeCore()
      : await (async () => {
          const inheritedSafeLease = inheritedOwnedIntelligenceSafeLeaseContext(options);
          return inheritedSafeLease
            ? executeCore(inheritedSafeLease)
            : executeRequestScopedOwnedIntelligence(options, executeCore);
        })();

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
