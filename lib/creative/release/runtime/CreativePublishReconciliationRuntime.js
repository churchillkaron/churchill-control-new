import crypto from "node:crypto";

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
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

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
  "published",
]);
const FAILED = new Set([
  "failed",
  "error",
  "cancelled",
  "canceled",
  "rejected",
  "expired",
]);

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function workerId() {
  return [
    "creative-publish-reconciliation",
    process.env.VERCEL_REGION || "local",
    process.pid,
    crypto.randomUUID(),
  ].join(":");
}

function normalizedResult(payload = {}) {
  const output = payload.output?.output || payload.output || payload.result || payload;
  const status = lower(
    payload.provider_status ||
    payload.status ||
    output.status ||
    output.state ||
    output.phase,
  );
  const error = payload.error || output.error || output.failure_reason || null;
  const evidence = {
    external_publication_id:
      output.id ||
      output.post_id ||
      output.publication_id ||
      output.media_id ||
      output.name ||
      null,
    external_publication_url:
      output.permalink ||
      output.url ||
      output.publication_url ||
      null,
  };

  if (FAILED.has(status) || error) {
    return { state: "FAILED", status, error, evidence };
  }
  if (
    evidence.external_publication_id ||
    evidence.external_publication_url ||
    SUCCESS.has(status)
  ) {
    return { state: "COMPLETED", status, error: null, evidence };
  }
  if (PENDING.has(status) || !status) {
    return { state: "PENDING", status, error: null, evidence };
  }
  return { state: "PENDING", status, error: null, evidence };
}

function pricingSnapshot(usage = {}) {
  const snapshot = usage.metadata?.pricing_snapshot || {};
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
      snapshot[field] === null ||
      snapshot[field] === undefined ||
      snapshot[field] === ""
    ) {
      throw new Error(`PUBLISH_PRICING_SNAPSHOT_${field.toUpperCase()}_REQUIRED`);
    }
  }

  const supplierCost = Number(snapshot.supplier_cost);
  const platformMarkup = Number(snapshot.platform_markup);
  const customerPrice = Number(snapshot.customer_price);
  if (
    !Number.isFinite(supplierCost) ||
    !Number.isFinite(platformMarkup) ||
    !Number.isFinite(customerPrice) ||
    supplierCost < 0 ||
    platformMarkup < 0 ||
    customerPrice < 0
  ) {
    throw new Error("VALID_PUBLISH_PRICING_SNAPSHOT_REQUIRED");
  }

  return {
    ...snapshot,
    supplier_cost: supplierCost,
    platform_markup: platformMarkup,
    customer_price: customerPrice,
    currency: text(snapshot.currency).toUpperCase(),
    unit: text(snapshot.unit),
  };
}

async function getExecution({ organization_id, execution_id }) {
  const execution = await AssetGraphRepository.getById(execution_id);
  if (
    !execution ||
    execution.organization_id !== organization_id ||
    execution.type !== CREATIVE_ASSET_NODE_TYPES.PUBLISH_EXECUTION
  ) {
    throw new Error("PUBLISH_EXECUTION_NOT_FOUND");
  }
  return execution;
}

function identities(execution = {}) {
  const provider = lower(execution.metadata?.provider_id);
  const providerJobId = text(execution.metadata?.provider_job_id);
  const usageId = text(execution.metadata?.usage_id);
  if (!provider) throw new Error("PUBLISH_PROVIDER_REQUIRED");
  if (!providerJobId) throw new Error("PUBLISH_PROVIDER_JOB_REQUIRED");
  if (!usageId) throw new Error("PUBLISH_USAGE_REQUIRED");
  return { provider, providerJobId, usageId };
}

async function settleFailure({ execution, claimed, normalized, usage, pricing }) {
  if (usage.status !== "FAILED" && usage.status !== "SUCCESS") {
    await UsageRuntime.fail({
      usage_id: usage.id,
      error: new Error(
        text(normalized.error?.message || normalized.error || normalized.status) ||
        "Publish provider execution failed",
      ),
      metadata: {
        ...(usage.metadata || {}),
        publish_provider_evidence: {
          state: normalized.state,
          status: normalized.status || null,
          received_at: new Date().toISOString(),
        },
      },
    });
  }

  if (pricing.customer_price > 0) {
    await WalletRuntime.release({
      organization_id: execution.organization_id,
      amount: pricing.customer_price,
      currency: pricing.currency,
      provider: execution.metadata.provider_id,
      reference: usage.id,
      metadata: {
        publish_execution_asset_node_id: execution.id,
        pricing_id: pricing.pricing_id,
      },
    });
  }

  return AssetGraphRepository.settlePublishReconciliation({
    execution_id: execution.id,
    organization_id: execution.organization_id,
    lease_token: claimed.metadata?.reconciliation_lease_token,
    status: "FAILED",
    evidence: {
      provider_status: normalized.status || null,
      connector_submission_state: "CONFIRMED_FAILED",
      error: text(normalized.error?.message || normalized.error) || null,
      settlement: "RELEASED",
      usage_id: usage.id,
    },
  });
}

async function settleSuccess({ execution, claimed, normalized, usage, pricing }) {
  if (
    !normalized.evidence.external_publication_id &&
    !normalized.evidence.external_publication_url
  ) {
    throw new Error("EXTERNAL_PUBLICATION_EVIDENCE_REQUIRED");
  }

  let completedUsage = usage;
  if (usage.status !== "SUCCESS") {
    completedUsage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: pricing.supplier_cost,
      platform_markup: pricing.platform_markup,
      customer_price: pricing.customer_price,
      quantity: Number(usage.quantity || 1),
      unit: pricing.unit,
      latency_ms: null,
      metadata: {
        ...(usage.metadata || {}),
        pricing_snapshot: pricing,
        publish_provider_evidence: {
          state: normalized.state,
          status: normalized.status || null,
          ...normalized.evidence,
          received_at: new Date().toISOString(),
        },
      },
    });
  }

  if (pricing.customer_price > 0) {
    await WalletRuntime.charge({
      organization_id: execution.organization_id,
      amount: pricing.customer_price,
      currency: pricing.currency,
      provider: execution.metadata.provider_id,
      usage_id: completedUsage.id,
      reference: completedUsage.id,
      metadata: {
        publish_execution_asset_node_id: execution.id,
        pricing_id: pricing.pricing_id,
      },
    });
  }

  const billing = await BillingRuntime.billUsage({
    usage_id: completedUsage.id,
  });

  return AssetGraphRepository.settlePublishReconciliation({
    execution_id: execution.id,
    organization_id: execution.organization_id,
    lease_token: claimed.metadata?.reconciliation_lease_token,
    status: "COMPLETED",
    evidence: {
      provider_status: normalized.status || null,
      connector_submission_state: "CONFIRMED",
      settlement: "CHARGED",
      usage_id: completedUsage.id,
      billing_invoice_id: billing.invoice?.id || null,
      ...normalized.evidence,
    },
  });
}

async function apply({ execution, payload }) {
  if (["COMPLETED", "FAILED"].includes(execution.metadata?.execution_status)) {
    return execution;
  }

  const { provider, providerJobId, usageId } = identities(execution);
  const normalized = normalizedResult(payload);

  if (normalized.state === "PENDING") {
    return AssetGraphRepository.recordPublishProgress({
      execution_id: execution.id,
      organization_id: execution.organization_id,
      provider_id: provider,
      provider_job_id: providerJobId,
      provider_status: normalized.status || "processing",
      evidence: {
        connector_submission_state: "ACCEPTED_PENDING",
        provider_progress_received_at: new Date().toISOString(),
      },
    });
  }

  const claimed = await AssetGraphRepository.claimPublishReconciliation({
    execution_id: execution.id,
    organization_id: execution.organization_id,
    provider_id: provider,
    provider_job_id: providerJobId,
    worker_id: workerId(),
    lease_seconds: 900,
  });
  if (!claimed) {
    return getExecution({
      organization_id: execution.organization_id,
      execution_id: execution.id,
    });
  }

  const usage = await UsageRuntime.get(usageId);
  if (!usage || usage.organization_id !== execution.organization_id) {
    throw new Error("PUBLISH_USAGE_NOT_FOUND");
  }
  const pricing = pricingSnapshot(usage);

  if (normalized.state === "FAILED") {
    return settleFailure({ execution, claimed, normalized, usage, pricing });
  }
  return settleSuccess({ execution, claimed, normalized, usage, pricing });
}

export const CreativePublishReconciliationRuntime = {
  normalize: normalizedResult,

  async complete({ organization_id, execution_id, payload = {} }) {
    return apply({
      execution: await getExecution({ organization_id, execution_id }),
      payload,
    });
  },

  async poll({ organization_id, execution_id }) {
    const execution = await getExecution({ organization_id, execution_id });
    if (["COMPLETED", "FAILED"].includes(execution.metadata?.execution_status)) {
      return execution;
    }

    const { provider, providerJobId } = identities(execution);
    const result = await getProviderStatus({
      provider,
      job_id: providerJobId,
      input: execution.metadata?.status_options || {},
      context: {
        organization_id,
        usage_id: execution.metadata?.usage_id || null,
      },
    });
    return apply({ execution, payload: result });
  },
};
