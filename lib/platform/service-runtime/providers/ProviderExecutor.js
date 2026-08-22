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

function attachProviderErrorLatency(error, latencyMs) {
  if (error && typeof error === "object") {
    Object.defineProperty(error, "__provider_latency_ms", {
      value: Math.max(0, Number(latencyMs) || 0),
      enumerable: false,
      configurable: true,
    });
  }
  return error;
}

export async function executeProvider(options = {}) {
  const startedAt = Date.now();
  try {
    const result = await executeProviderCore(options);
    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorLatency(error, Date.now() - startedAt);
  }
}

export async function getProviderStatus(options = {}) {
  const startedAt = Date.now();
  try {
    const result = await getProviderStatusCore(options);
    return attachProviderLatency(result, Date.now() - startedAt);
  } catch (error) {
    throw attachProviderErrorLatency(error, Date.now() - startedAt);
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
