import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.service.pending-poll-resilience.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function transportPollError(error) {
  const message = text(error?.message || error).toUpperCase();
  return (
    message.includes("REQUEST FAILED WITH STATUS 405") ||
    message.includes("REQUEST FAILED WITH STATUS 408") ||
    message.includes("REQUEST FAILED WITH STATUS 429") ||
    message.includes("REQUEST FAILED WITH STATUS 500") ||
    message.includes("REQUEST FAILED WITH STATUS 502") ||
    message.includes("REQUEST FAILED WITH STATUS 503") ||
    message.includes("REQUEST FAILED WITH STATUS 504") ||
    message.includes("FETCH FAILED") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("UND_ERR_")
  );
}

function install() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const settleWithoutResilience = ServiceExecutionRuntime.settle.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.settle = async function settleWithPollResilience(
    input = {},
  ) {
    try {
      return await settleWithoutResilience(input);
    } catch (error) {
      if (!transportPollError(error)) throw error;

      return {
        success: true,
        pending: true,
        failed: false,
        provider: input.provider || null,
        provider_job_id: input.provider_job_id || null,
        provider_status: "poll_transport_error",
        settlement: "RESERVED",
        poll_error: text(error?.message || error),
        retryable: true,
        output: null,
      };
    }
  };
}

install();

export const ServicePendingPollResilienceRuntime = Object.freeze({
  installed: true,
  contract: "SERVICE_PENDING_POLL_RESILIENCE_V1",
  transportPollError,
});
