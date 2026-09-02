import {
  executeProvider as executeProviderCore,
  getProviderStatus as getProviderStatusCore,
  loadProviderRuntime,
  prepareProviderInputForExecution,
} from "./ProviderExecutorCore";

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
    const result = await executeProviderCore(options);
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
