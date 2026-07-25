import crypto from "node:crypto";

import { getProviderStatus } from "@/lib/platform/service-runtime/providers/ProviderExecutor";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { WalletRuntime } from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";
import { BillingRuntime } from "@/lib/platform/service-runtime/billing/runtime/BillingRuntime";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as TaskRepository from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import { CreativeStorageRuntime } from "@/lib/creative/storage/runtime/CreativeStorageRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

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

function firstUrl(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return null;
  if (typeof value === "string" && /^https:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = firstUrl(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
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
    firstUrl(
      source.output ||
      source.outputs ||
      source.files ||
      source.images ||
      source.videos ||
      source.audios,
    );

  if (FAILED.has(status) || error) {
    return { state: "FAILED", status, error, url, source };
  }
  if (url) {
    return { state: "COMPLETED", status, error: null, url, source };
  }
  if (SUCCESS.has(status)) {
    return {
      state: "FAILED",
      status,
      error: "PROVIDER_COMPLETION_MEDIA_URL_REQUIRED",
      url: null,
      source,
    };
  }
  if (PENDING.has(status) || !status) {
    return { state: "PENDING", status, error: null, url: null, source };
  }
  return { state: "PENDING", status, error: null, url: null, source };
}

function submission(task = {}) {
  return task.output?.provider_submission || {};
}

function pricingSnapshot(task = {}) {
  const submitted = submission(task);
  return submitted.pricing || task.output?.pricing || null;
}

function validPricingSnapshot(pricing) {
  if (!pricing || typeof pricing !== "object") {
    throw new Error("PROVIDER_COMPLETION_PRICING_SNAPSHOT_REQUIRED");
  }
  const required = [
    "pricing_id",
    "supplier_cost",
    "platform_markup",
    "customer_price",
    "currency",
    "unit",
  ];
  for (const field of required) {
    if (
      pricing[field] === null ||
      pricing[field] === undefined ||
      pricing[field] === ""
    ) {
      throw new Error(
        `PROVIDER_COMPLETION_PRICING_${field.toUpperCase()}_REQUIRED`,
      );
    }
  }

  const supplierCost = Number(pricing.supplier_cost);
  const platformMarkup = Number(pricing.platform_markup);
  const customerPrice = Number(pricing.customer_price);
  if (
    !Number.isFinite(supplierCost) ||
    !Number.isFinite(platformMarkup) ||
    !Number.isFinite(customerPrice) ||
    supplierCost < 0 ||
    platformMarkup < 0 ||
    customerPrice < 0
  ) {
    throw new Error("VALID_PROVIDER_COMPLETION_PRICING_REQUIRED");
  }

  return {
    ...pricing,
    supplier_cost: supplierCost,
    platform_markup: platformMarkup,
    customer_price: customerPrice,
    currency: String(pricing.currency).trim().toUpperCase(),
    unit: String(pricing.unit).trim(),
  };
}

function settlementInput(task = {}) {
  const submitted = submission(task);
  const pricing = validPricingSnapshot(pricingSnapshot(task));
  const usage = submitted.usage || task.output?.usage || {};
  const quantity = Number(usage.quantity ?? task.input?.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("VALID_PROVIDER_COMPLETION_QUANTITY_REQUIRED");
  }

  return {
    provider: lower(
      task.provider_id || submitted.provider || task.output?.provider,
    ),
    usage_id: usage.id || usage.usage_id || task.output?.usage_id || null,
    pricing,
    usage,
    amount: pricing.customer_price,
    currency: pricing.currency,
    quantity,
    unit: pricing.unit,
    job_id:
      task.output?.provider_job_id ||
      submitted.provider_job_id ||
      submitted.output?.provider_job_id ||
      null,
  };
}

function safeProviderEvidence(normalized) {
  return {
    status: normalized.status || null,
    state: normalized.state,
    output_url_present: Boolean(normalized.url),
    received_at: new Date().toISOString(),
  };
}

function completionWorkerId() {
  return [
    "provider-completion",
    process.env.VERCEL_REGION || "local",
    process.pid,
    crypto.randomUUID(),
  ].join(":");
}

async function claimTerminal(task) {
  const settlement = settlementInput(task);
  if (!settlement.provider) {
    throw new Error("PRODUCTION_TASK_PROVIDER_REQUIRED");
  }
  if (!settlement.job_id) {
    throw new Error("PRODUCTION_TASK_PROVIDER_JOB_REQUIRED");
  }
  if (!settlement.usage_id) {
    throw new Error("PRODUCTION_TASK_USAGE_REQUIRED");
  }

  const claimed = await TaskRepository.claimProviderCompletion({
    id: task.id,
    organization_id: task.organization_id,
    provider_id: settlement.provider,
    provider_job_id: settlement.job_id,
    worker_id: completionWorkerId(),
  });

  return { claimed, settlement };
}

async function settleFailure(task, normalized) {
  const { claimed, settlement } = await claimTerminal(task);
  if (!claimed) return ProductionTaskRuntime.get(task.id);

  const message =
    normalized.error?.message ||
    normalized.error ||
    normalized.status ||
    "Provider execution failed";
  const usage = await UsageRuntime.get(settlement.usage_id);
  if (!usage) throw new Error("PRODUCTION_TASK_USAGE_NOT_FOUND");

  if (usage.status !== "FAILED" && usage.status !== "SUCCESS") {
    await UsageRuntime.fail({
      usage_id: settlement.usage_id,
      error: new Error(String(message)),
      metadata: {
        ...(usage.metadata || {}),
        pricing_snapshot: settlement.pricing,
        provider_evidence: safeProviderEvidence(normalized),
      },
    });
  }

  if (settlement.amount > 0) {
    await WalletRuntime.release({
      organization_id: task.organization_id,
      amount: settlement.amount,
      currency: settlement.currency,
      provider: settlement.provider,
      reference: settlement.usage_id,
      metadata: {
        production_task_id: task.id,
        provider_job_id: settlement.job_id,
        pricing_id: settlement.pricing.pricing_id,
      },
    });
  }

  return ProductionTaskRuntime.fail(task.id, new Error(String(message)), {
    lease_token: claimed.lease_token,
    retryable: false,
  });
}

async function settleSuccess(task, normalized) {
  if (!normalized.url) {
    throw new Error("PROVIDER_COMPLETION_MEDIA_URL_REQUIRED");
  }
  if (!task.creative_project_id) {
    throw new Error("CREATIVE_PROJECT_ID_REQUIRED_FOR_INGESTION");
  }

  const { claimed, settlement } = await claimTerminal(task);
  if (!claimed) return ProductionTaskRuntime.get(task.id);

  const stored = await CreativeStorageRuntime.uploadFromUrl({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    asset_id: task.id,
    url: normalized.url,
    filename: "provider-output.bin",
  });

  const assetNode = await CreativeAssetGraphRuntime.createFromStoredProductionOutput({
    task,
    stored,
    output: {
      provider: settlement.provider,
      pricing: settlement.pricing,
      usage: settlement.usage,
      output: {
        ...normalized.source,
        storage_path: stored.storage_path,
        checksum: stored.checksum,
        byte_size: stored.byte_size,
        content_type: stored.content_type,
        delivery_mode: stored.delivery_mode,
      },
    },
  });
  if (!assetNode?.id) {
    throw new Error("PROVIDER_COMPLETION_ASSET_NODE_REQUIRED");
  }

  let usage = await UsageRuntime.get(settlement.usage_id);
  if (!usage) throw new Error("PRODUCTION_TASK_USAGE_NOT_FOUND");
  if (usage.status === "FAILED") {
    throw new Error("FAILED_USAGE_CANNOT_COMPLETE_PROVIDER_OUTPUT");
  }
  if (usage.status !== "SUCCESS") {
    usage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: settlement.pricing.supplier_cost,
      platform_markup: settlement.pricing.platform_markup,
      customer_price: settlement.amount,
      quantity: settlement.quantity,
      unit: settlement.unit,
      latency_ms: null,
      metadata: {
        ...(usage.metadata || {}),
        pricing_snapshot: settlement.pricing,
        provider_evidence: safeProviderEvidence(normalized),
        storage_path: stored.storage_path,
        checksum: stored.checksum,
        asset_node_id: assetNode.id,
      },
    });
  }

  if (settlement.amount > 0) {
    await WalletRuntime.charge({
      organization_id: task.organization_id,
      amount: settlement.amount,
      currency: settlement.currency,
      provider: settlement.provider,
      usage_id: usage.id,
      reference: usage.id,
      metadata: {
        production_task_id: task.id,
        provider_job_id: settlement.job_id,
        pricing_id: settlement.pricing.pricing_id,
        asset_node_id: assetNode.id,
      },
    });
  }

  const billing = await BillingRuntime.billUsage({ usage_id: usage.id });

  return ProductionTaskRuntime.complete(task.id, {
    asset_node_id: assetNode.id,
    provider_status: normalized.status,
    provider: settlement.provider,
    pricing: settlement.pricing,
    usage: billing?.usage || usage,
    billing,
    settlement: "CHARGED",
    storage_path: stored.storage_path,
    checksum: stored.checksum,
    byte_size: stored.byte_size,
    content_type: stored.content_type,
    delivery_mode: stored.delivery_mode,
    output: {
      storage_path: stored.storage_path,
      checksum: stored.checksum,
      byte_size: stored.byte_size,
      content_type: stored.content_type,
      delivery_mode: stored.delivery_mode,
    },
  }, { lease_token: claimed.lease_token });
}

async function apply(task, payload = {}) {
  if (!task) throw new Error("Production task not found");
  if (["COMPLETED", "FAILED", "SKIPPED"].includes(task.status)) return task;

  const normalized = normalizedResult(payload);
  if (normalized.state === "FAILED") return settleFailure(task, normalized);
  if (normalized.state === "COMPLETED") return settleSuccess(task, normalized);

  const settlement = settlementInput(task);
  if (!settlement.provider || !settlement.job_id) {
    throw new Error("PROVIDER_PROGRESS_IDENTITY_REQUIRED");
  }

  return TaskRepository.recordProviderProgress({
    id: task.id,
    organization_id: task.organization_id,
    provider_id: settlement.provider,
    provider_job_id: settlement.job_id,
    provider_status: normalized.status || "processing",
    output: {
      provider_status: normalized.status || "processing",
      settlement: task.output?.settlement || "RESERVED",
    },
  });
}

export const CreativeProviderCompletionRuntime = {
  normalize: normalizedResult,

  async complete({ task_id, payload = {} }) {
    return apply(await ProductionTaskRuntime.get(task_id), payload);
  },

  async poll({ task_id }) {
    const task = await ProductionTaskRuntime.get(task_id);
    if (!task) throw new Error("Production task not found");
    if (["COMPLETED", "FAILED", "SKIPPED"].includes(task.status)) return task;

    const settlement = settlementInput(task);
    if (!settlement.provider) {
      throw new Error("Production task provider required");
    }
    if (!settlement.job_id) {
      throw new Error("Production task provider job required");
    }

    const result = await getProviderStatus({
      provider: settlement.provider,
      job_id: settlement.job_id,
      input:
        task.input?.status_options ||
        task.metadata?.status_options ||
        {},
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
