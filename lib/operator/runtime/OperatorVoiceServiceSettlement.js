import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_MS = 750;

function text(value) {
  return String(value ?? "").trim();
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutMs() {
  return boundedNumber(
    process.env.AVANTIQO_OPERATOR_VOICE_SETTLEMENT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    5_000,
    55_000,
  );
}

function pollMs() {
  return boundedNumber(
    process.env.AVANTIQO_OPERATOR_VOICE_SETTLEMENT_POLL_MS,
    DEFAULT_POLL_MS,
    250,
    5_000,
  );
}

export async function settleOperatorVoiceExecution({
  execution,
  organizationId,
  capability,
  metadata = {},
}) {
  if (!execution?.pending) return execution;

  const provider = text(execution?.provider);
  const providerJobId = text(execution?.provider_job_id);
  const usageId = text(execution?.usage?.id);
  if (!provider || !providerJobId || !usageId) {
    throw new Error("OPERATOR_VOICE_PENDING_EXECUTION_INVALID");
  }

  const deadline = Date.now() + timeoutMs();
  let settled = execution;

  while (Date.now() < deadline) {
    await sleep(pollMs());

    settled = await ServiceExecutionRuntime.settle({
      organization_id: organizationId,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: execution?.pricing || {},
      quantity: execution?.usage?.quantity ?? null,
      unit: execution?.usage?.unit ?? null,
      metadata: {
        ...metadata,
        operator_voice_settlement: true,
      },
      provider_status_input: {
        capability,
      },
      credential_id: execution?.credential_id || null,
      started_at: execution?.started_at || null,
    });

    if (settled?.failed || settled?.success === false) {
      const error = new Error(
        text(settled?.error) || "OPERATOR_VOICE_PROVIDER_EXECUTION_FAILED",
      );
      error.status = 502;
      throw error;
    }

    if (!settled?.pending) return settled;
  }

  const error = new Error("OPERATOR_VOICE_PROVIDER_SETTLEMENT_TIMEOUT");
  error.status = 504;
  throw error;
}
