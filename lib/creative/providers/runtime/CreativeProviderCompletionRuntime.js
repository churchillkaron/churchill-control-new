import {
  getProviderStatus,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  UsageRuntime,
} from "@/lib/platform/service-runtime/usage/UsageRuntime";

import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

import {
  BillingRuntime,
} from "@/lib/platform/service-runtime/billing/runtime/BillingRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const PENDING = new Set([
  "pending",
  "queued",
  "submitted",
  "processing",
  "running",
  "in_progress",
]);

const SUCCESS = new Set([
  "success",
  "succeeded",
  "complete",
  "completed",
  "done",
  "ready",
]);

const FAILED = new Set([
  "failed",
  "error",
  "cancelled",
  "canceled",
  "rejected",
  "expired",
]);

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function deepValues(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => deepValues(item, depth + 1));
  if (typeof value === "object") return Object.values(value).flatMap((item) => deepValues(item, depth + 1));
  return [value];
}

function firstUrl(value) {
  return deepValues(value).find(
    (item) => typeof item === "string" && /^https?:\/\//i.test(item),
  ) || null;
}

function normalizedResult(payload = {}) {
  const source = payload.output || payload.result || payload;
  const status = lower(
    payload.status ||
    source.status ||
    source.state ||
    source.phase ||
    source.data?.status,
  );
  const error =
    payload.error ||
    source.error ||
    source.failure_reason ||
    source.failureReason ||
    null;
  const explicitOutput =
    source.output ||
    source.outputs ||
    source.files ||
    source.images ||
    source.videos ||
    source.audios ||
    source.data?.output ||
    source.data?.outputs ||
    null;
  const url =
    source.file_url ||
    source.fileUrl ||
    source.image_url ||
    source.imageUrl ||
    source.video_url ||
    source.videoUrl ||
    source.audio_url ||
    source.audioUrl ||
    source.url ||
    firstUrl(explicitOutput);

  if (FAILED.has(status) || error) {
    return { state: "FAILED", status, error, url, output: source };
  }

  if (url || SUCCESS.has(status)) {
    return { state: "COMPLETED", status, error: null, url, output: source };
  }

  if (PENDING.has(status) || !status) {
    return { state: "PENDING", status, error: null, url: null, output: source };
  }

  return { state: "PENDING", status, error: null, url: null, output: source };
}

function submission(task = {}) {
  return task.output?.provider_submission || {};
}

function settlementInput(task = {}) {
  const submitted = submission(task);
  const pricing = submitted.pricing || task.output?.pricing || {};
  const usage = submitted.usage || task.output?.usage || {};

  return {
    provider: task.provider_id || submitted.provider || task.output?.provider || null,
    usage_id: usage.id || usage.usage_id || task.output?.usage_id || null,
    pricing,
    usage,
    amount: Number(pricing.customer_price ?? usage.customer_price ?? 0),
    currency: pricing.currency || usage.currency || task.cost?.currency || null,
    quantity: Number(usage.quantity ?? task.input?.quantity ?? 1),
    unit: usage.unit || pricing.unit || task.input?.unit || null,
    job_id:
      task.output?.provider_job_id ||
      submitted.provider_job_id ||
      submitted.output?.provider_job_id ||
      null,
  };
}

async function settleFailure(task, normalized) {
  const settlement = settlementInput(task);
  const message =
    normalized.error?.message ||
    normalized.error ||
    normalized.status ||
    "Provider execution failed";

  if (settlement.usage_id) {
    const usage = await UsageRuntime.get(settlement.usage_id);
    if (usage && usage.status !== "FAILED" && usage.status !== "SUCCESS") {
      await UsageRuntime.fail({
        usage_id: settlement.usage_id,
        error: new Error(String(message)),
        metadata: {
          ...(usage.metadata || {}),
          provider_result: normalized.output,
        },
      });
    }
  }

  if (settlement.amount > 0) {
    await WalletRuntime.release({
      organization_id: task.organization_id,
      amount: settlement.amount,
      currency: settlement.currency,
      provider: settlement.provider,
      reference: settlement.usage_id || task.id,
    });
  }

  return ProductionTaskRuntime.update(task.id, {
    status: "FAILED",
    error: String(message),
    output: {
      ...(task.output || {}),
      provider_result: normalized.output,
      provider_status: normalized.status,
      settlement: "RELEASED",
    },
    timing: {
      ...(task.timing || {}),
      completed_at: new Date().toISOString(),
    },
  });
}

async function settleSuccess(task, normalized) {
  const settlement = settlementInput(task);
  let usage = settlement.usage_id
    ? await UsageRuntime.get(settlement.usage_id)
    : null;

  if (usage && usage.status !== "SUCCESS") {
    usage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: settlement.pricing.supplier_cost ?? usage.supplier_cost,
      platform_markup: settlement.pricing.platform_markup ?? usage.platform_markup,
      customer_price: settlement.amount,
      quantity: settlement.quantity,
      unit: settlement.unit,
      latency_ms: null,
      metadata: {
        ...(usage.metadata || {}),
        provider_result: normalized.output,
      },
    });
  }

  if (settlement.amount > 0) {
    await WalletRuntime.charge({
      organization_id: task.organization_id,
      amount: settlement.amount,
      currency: settlement.currency,
      provider: settlement.provider,
      usage_id: usage?.id || settlement.usage_id,
      reference: usage?.id || settlement.usage_id || task.id,
    });
  }

  const billing = usage
    ? await BillingRuntime.billUsage({ usage_id: usage.id })
    : null;

  return ProductionTaskRuntime.complete(task.id, {
    provider_result: normalized.output,
    provider_status: normalized.status,
    provider: settlement.provider,
    pricing: settlement.pricing,
    usage: billing?.usage || usage,
    billing,
    settlement: "CHARGED",
    output: {
      ...normalized.output,
      url: normalized.url || normalized.output?.url || null,
    },
  });
}

async function apply(task, payload = {}) {
  if (!task) throw new Error("Production task not found");
  if (task.status === "COMPLETED" || task.status === "FAILED") return task;

  const normalized = normalizedResult(payload);

  if (normalized.state === "FAILED") {
    return settleFailure(task, normalized);
  }

  if (normalized.state === "COMPLETED") {
    return settleSuccess(task, normalized);
  }

  return ProductionTaskRuntime.update(task.id, {
    status: "RUNNING",
    output: {
      ...(task.output || {}),
      provider_result: normalized.output,
      provider_status: normalized.status || "processing",
      settlement: task.output?.settlement || "RESERVED",
    },
  });
}

export const CreativeProviderCompletionRuntime = {
  normalize: normalizedResult,

  async complete({ task_id, payload = {} }) {
    const task = await ProductionTaskRuntime.get(task_id);
    return apply(task, payload);
  },

  async poll({ task_id }) {
    const task = await ProductionTaskRuntime.get(task_id);
    if (!task) throw new Error("Production task not found");
    if (task.status === "COMPLETED" || task.status === "FAILED") return task;

    const settlement = settlementInput(task);
    if (!settlement.provider) throw new Error("Production task provider required");
    if (!settlement.job_id) throw new Error("Production task provider job required");

    const result = await getProviderStatus({
      provider: settlement.provider,
      job_id: settlement.job_id,
      input: task.input?.status_options || task.metadata?.status_options || {},
      context: {
        organization_id: task.organization_id,
        credential_id:
          submission(task).credential_id ||
          task.output?.credential_id ||
          null,
      },
    });

    return apply(task, result);
  },
};
