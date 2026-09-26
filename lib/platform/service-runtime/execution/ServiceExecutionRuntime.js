import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime.js";

import {
  resolveProvider,
} from "../providers/ProviderResolver.js";

import {
  executeProvider,
  getProviderStatus,
  cancelProvider,
} from "../providers/ProviderExecutor.js";

import {
  PricingRuntime,
} from "../pricing/PricingRuntime.js";

import {
  getProviderPricing,
} from "../pricing/repositories/ProviderPricingRepository.js";

import {
  getIntelligenceLocalQueueHealth,
  shouldUseLocalIntelligenceQueue,
} from "../providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js";
import {
  shouldUseHierarchicalLocalIntelligence,
} from "../providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js";
import {
  AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
} from "../providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js";
import {
  AvantiqoCodeLocalQueueProvider,
  isCodeLocalCapability,
} from "../providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js";
import {
  settleIntelligenceModalOverflowSupplierCost,
} from "../governance/IntelligenceModalOverflowExecutionRuntime.js";

import {
  WalletRuntime,
} from "../wallet/runtime/WalletRuntime.js";

import {
  UsageRuntime,
} from "../usage/UsageRuntime.js";

import {
  BillingRuntime,
} from "../billing/runtime/BillingRuntime.js";

import {
  resolveServiceCapabilities,
} from "../services/resolver/ServiceCapabilityResolver.js";

import {
  resolvePrimaryExecutionCapability,
} from "../services/resolver/CapabilityExecutionResolver.js";

import {
  buildOwnedReasoningFallbackInput,
  ownedReasoningFallbackDecision,
  ownedReasoningFallbackEvidence,
} from "./OwnedReasoningFallbackPolicy.js";
import {
  CreativeProviderExecutionClaimRuntime,
} from "./CreativeProviderExecutionClaimRuntime.js";
import {
  settleModalActualSupplierCost,
} from "../governance/ModalActualSupplierCostRuntime.js";

const PENDING_STATUSES = new Set([
  "pending",
  "queued",
  "submitted",
  "processing",
  "running",
  "in_progress",
  "in-progress",
]);

const SUCCESS_STATUSES = new Set([
  "complete",
  "completed",
  "succeeded",
  "success",
  "finished",
  "done",
]);

const FAILURE_STATUSES = new Set([
  "failed",
  "failure",
  "cancelled",
  "canceled",
  "rejected",
  "error",
  "expired",
]);

function first(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  ) ?? null;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value) {
  const normalized = typeof value === "string"
    ? value.trim().replace(/\s*(seconds?|secs?|s|minutes?|mins?|m)$/i, "")
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function resolveExecutionQuantity({ payload = {}, input = {}, unit = null }) {
  const explicit = positiveNumber(first(payload.quantity, input.quantity));
  if (explicit) return explicit;

  const normalizedUnit = String(unit || "request").trim().toLowerCase();
  const output = payload.output_spec || payload.outputSpec || {};
  const generation = payload.generation || {};
  const generationOutput = generation.output_spec || generation.outputSpec || {};

  if (normalizedUnit === "second") {
    return positiveNumber(first(
      payload.duration_seconds,
      payload.durationSeconds,
      output.duration_seconds,
      output.durationSeconds,
      generation.duration_seconds,
      generation.durationSeconds,
      generationOutput.duration_seconds,
      generationOutput.durationSeconds,
      payload.duration,
      generation.duration,
    )) || 1;
  }

  if (normalizedUnit === "minute") {
    const minutes = positiveNumber(first(
      payload.duration_minutes,
      payload.durationMinutes,
      payload.estimated_minutes,
      payload.estimatedMinutes,
      output.duration_minutes,
      output.durationMinutes,
      generation.duration_minutes,
      generation.durationMinutes,
    ));
    if (minutes) return minutes;

    const seconds = positiveNumber(first(
      payload.duration_seconds,
      payload.durationSeconds,
      output.duration_seconds,
      output.durationSeconds,
      generation.duration_seconds,
      generation.durationSeconds,
      generationOutput.duration_seconds,
      generationOutput.durationSeconds,
    ));
    return seconds ? seconds / 60 : 1;
  }

  if (normalizedUnit === "image") {
    return positiveNumber(first(payload.n, payload.count, generation.n, generation.count)) || 1;
  }

  return 1;
}


async function localOwnedCodePreviewPricingRecord({
  selectedProvider,
  pricingRecord,
  capability,
  policy = {},
} = {}) {
  if (String(selectedProvider?.provider || "").trim() !== "avantiqo-code") return pricingRecord;
  if (!isCodeLocalCapability(capability)) return pricingRecord;
  if (String(policy.execution_scope || "").trim().toUpperCase() !== "BENCHMARK_REVIEW_PREVIEW") return pricingRecord;
  if (policy.benchmark_only !== true || policy.owned_only_required !== true || policy.external_fallback_allowed !== false) return pricingRecord;
  if (!(await AvantiqoCodeLocalQueueProvider.available())) return pricingRecord;
  const metadata = pricingRecord?.metadata && typeof pricingRecord.metadata === "object" && !Array.isArray(pricingRecord.metadata)
    ? pricingRecord.metadata
    : {};
  return {
    ...pricingRecord,
    input_cost_per_1m: 0,
    output_cost_per_1m: 0,
    cost_per_unit: 0,
    markup_percent: 0,
    benchmark_review_preview_authorized: true,
    metadata: {
      ...metadata,
      allow_zero_price: true,
      zero_price: true,
      pricing_mode: "ZERO_PRICE",
      supplier_billing_required: false,
      provider_supplier_account_verification_required: false,
      production_routing_allowed: false,
      owned_local_development_preview: true,
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      local_execution_zero_supplier_cost: true,
    },
  };
}

function resolvePricingDimensions(payload = {}) {
  const output = payload.output_spec || payload.outputSpec || {};
  const generation = payload.generation || {};
  const generationOutput = generation.output_spec || generation.outputSpec || {};
  const parameters = {
    ...(generation.provider_parameters || generation.providerParameters || {}),
    ...(payload.provider_parameters || payload.providerParameters || {}),
  };

  const quality = first(
    payload.quality,
    output.quality,
    generation.quality,
    generationOutput.quality,
    parameters.quality,
  );
  const size = first(
    payload.size,
    output.size,
    generation.size,
    generationOutput.size,
    parameters.size,
  );

  return {
    ...(quality ? { quality: String(quality).trim().toLowerCase() } : {}),
    ...(size ? { size: String(size).trim().toLowerCase() } : {}),
  };
}

function urlFrom(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^(https?:\/\/|data:|blob:|s3:\/\/|gs:\/\/)/i.test(value)
      ? value
      : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => urlFrom(item, seen)).find(Boolean) || null;
  }

  const direct = first(
    value.url,
    value.file_url,
    value.fileUrl,
    value.image_url,
    value.imageUrl,
    value.video_url,
    value.videoUrl,
    value.audio_url,
    value.audioUrl,
    value.download_url,
    value.downloadUrl,
  );
  const directUrl = urlFrom(direct, seen);
  if (directUrl) return directUrl;

  for (const key of [
    "output",
    "outputs",
    "result",
    "results",
    "data",
    "files",
    "images",
    "videos",
    "audio",
  ]) {
    const nested = urlFrom(value[key], seen);
    if (nested) return nested;
  }

  return null;
}

function executionState(result = {}) {
  const output = result?.output || result || {};
  const status = String(first(
    output.status,
    output.state,
    output.phase,
    result.status,
    result.state,
    result.phase,
  ) || "").toLowerCase();
  const jobId = first(
    output.provider_job_id,
    output.providerJobId,
    output.job_id,
    output.jobId,
    output.task_id,
    output.taskId,
    output.request_id,
    output.requestId,
    output.video_job_id,
    output.videoJobId,
    result.provider_job_id,
    result.providerJobId,
    result.job_id,
    result.jobId,
    result.task_id,
    result.taskId,
    result.request_id,
    result.requestId,
  );
  const mediaUrl = urlFrom(output) || urlFrom(result);
  const failed = FAILURE_STATUSES.has(status);
  const completed = Boolean(mediaUrl) || SUCCESS_STATUSES.has(status);
  const pending = !failed && !completed && (
    Boolean(jobId) || PENDING_STATUSES.has(status)
  );

  return {
    pending,
    failed,
    completed,
    job_id: jobId,
    media_url: mediaUrl,
    provider_status: status || null,
  };
}

function failureMessage(result = {}, state = {}) {
  return first(
    result?.error?.message,
    result?.error,
    result?.message,
    result?.output?.error?.message,
    result?.output?.error,
    result?.output?.message,
    state.provider_status && `Provider job ${state.provider_status}`,
    "Provider job failed",
  );
}

function latencyFrom(startedAt) {
  const timestamp = Date.parse(startedAt || "");
  return Number.isFinite(timestamp)
    ? Math.max(0, Date.now() - timestamp)
    : null;
}

function providerUsage(result = {}) {
  const candidates = [
    result?.usage,
    result?.output?.usage,
    result?.output?.raw?.usage,
    result?.raw?.usage,
    result?.result?.usage,
    result?.data?.usage,
  ].filter((value) => value && typeof value === "object");
  const usage = candidates[0] || {};

  return {
    input_tokens: finite(first(
      usage.input_tokens,
      usage.inputTokens,
      usage.prompt_tokens,
      usage.promptTokens,
    )),
    output_tokens: finite(first(
      usage.output_tokens,
      usage.outputTokens,
      usage.completion_tokens,
      usage.completionTokens,
    )),
    cached_input_tokens: finite(first(
      usage.cached_input_tokens,
      usage.cachedInputTokens,
      usage.prompt_tokens_details?.cached_tokens,
      usage.promptTokensDetails?.cachedTokens,
    )),
    engine_prepare_ms: finite(first(usage.engine_prepare_ms, usage.enginePrepareMs)),
    generation_ms: finite(first(usage.generation_ms, usage.generationMs)),
    structured_finalization_ms: finite(first(usage.structured_finalization_ms, usage.structuredFinalizationMs)),
    compute_ms: finite(first(usage.compute_ms, usage.computeMs)),
    request_queue_ms: finite(first(usage.request_queue_ms, usage.requestQueueMs)),
    time_to_first_token_ms: finite(first(usage.time_to_first_token_ms, usage.timeToFirstTokenMs)),
    decode_ms: finite(first(usage.decode_ms, usage.decodeMs)),
    scheduler_ms: finite(first(usage.scheduler_ms, usage.schedulerMs)),
    model_forward_ms: finite(first(usage.model_forward_ms, usage.modelForwardMs)),
    model_execute_ms: finite(first(usage.model_execute_ms, usage.modelExecuteMs)),
  };
}

async function applyIntelligenceModalOverflowSupplierSettlement({
  provider,
  organizationId,
  providerJobId,
  settledPricing,
} = {}) {
  const jobId = String(providerJobId || "").trim();
  if (provider !== "avantiqo-intelligence" || !jobId.startsWith("modal-intelligence-direct:")) {
    return { pricing: settledPricing, overflow_supplier_settlement: null };
  }
  const measured = await settleIntelligenceModalOverflowSupplierCost({
    organizationId,
    providerJobId: jobId,
  });
  const customerPrice = finite(settledPricing?.customer_price);
  const supplierCost = finite(measured.actual_supplier_cost_thb);
  return {
    pricing: {
      ...settledPricing,
      supplier_cost: supplierCost,
      platform_markup: Number((customerPrice - supplierCost).toFixed(6)),
    },
    overflow_supplier_settlement: measured,
  };
}

function applyOwnedLocalSupplierSettlement({
  provider,
  providerJobId,
  settledPricing,
  result,
} = {}) {
  const jobId = String(providerJobId || "").trim();
  const localDocumentVision =
    provider === "avantiqo-image" &&
    jobId.startsWith("local-document-vision:");
  if (!localDocumentVision) return settledPricing;

  const reported =
    result?.output?.metrics?.supplier_cost_thb ??
    result?.metrics?.supplier_cost_thb ??
    result?.output?.output?.metrics?.supplier_cost_thb;
  const supplierCost = Number(reported);
  if (!Number.isFinite(supplierCost) || supplierCost < 0) return settledPricing;

  const customerPrice = finite(settledPricing?.customer_price);
  return {
    ...settledPricing,
    supplier_cost: Number(supplierCost.toFixed(6)),
    platform_markup: Number((customerPrice - supplierCost).toFixed(6)),
    pricing_metadata: {
      ...(settledPricing?.pricing_metadata || {}),
      actual_supplier_cost_source: "AVANTIQO_LOCAL_NODE_JOB_METRICS",
      actual_infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
    },
  };
}

function nestedPositiveNumber(root, keys, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);

  for (const key of keys) {
    const value = positiveNumber(root[key]);
    if (value) return value;
  }

  const children = Array.isArray(root)
    ? root
    : [
        root.output,
        root.outputs,
        root.result,
        root.results,
        root.data,
        root.raw,
        root.audio,
        root.media,
      ];
  for (const child of children) {
    const value = nestedPositiveNumber(child, keys, seen);
    if (value) return value;
  }
  return null;
}

function providerSettlementQuantity({ pricing = {}, result = {}, fallbackQuantity = 1 }) {
  const metadata = pricing.pricing_metadata || {};
  if (metadata.settle_quantity_from_provider_output !== true) return fallbackQuantity;

  const unit = String(pricing.unit || "").trim().toLowerCase();
  const seconds = nestedPositiveNumber(result, [
    "billing_quantity_seconds",
    "audio_duration_seconds",
    "output_duration_seconds",
    "duration_seconds",
    "durationSeconds",
  ]);
  const minutes = nestedPositiveNumber(result, [
    "billing_quantity_minutes",
    "audio_duration_minutes",
    "output_duration_minutes",
    "duration_minutes",
    "durationMinutes",
  ]);

  if (unit === "second" && seconds) return Number(seconds.toFixed(6));
  if (unit === "minute") {
    if (minutes) return Number(minutes.toFixed(6));
    if (seconds) return Number((seconds / 60).toFixed(6));
  }

  throw new Error(`PROVIDER_ACTUAL_QUANTITY_REQUIRED_FOR_SETTLEMENT:${pricing.pricing_id || "unknown"}:${unit || "unknown"}`);
}

async function actualPricing({
  pricing,
  result,
  pricingRecord = null,
  quantity = 1,
  pricingDimensions = {},
  organizationId = null,
  usageId = null,
  approvalId = null,
  settlementCurrency = null,
  effectiveDate = null,
}) {
  const settleQuantityFromProvider = pricing?.pricing_metadata?.settle_quantity_from_provider_output === true;
  let resolved = pricing;

  if (pricing?.estimated === true || settleQuantityFromProvider) {
    const usage = providerUsage(result);
    const settledQuantity = providerSettlementQuantity({
      pricing,
      result,
      fallbackQuantity: quantity,
    });
    const actualUsage = {
      ...usage,
      ...pricingDimensions,
      quantity: settledQuantity,
      actual: true,
    };

    resolved = pricingRecord
      ? PricingRuntime.resolveRecord({
          pricing: pricingRecord,
          currency: pricing.currency,
          usage: actualUsage,
        })
      : await PricingRuntime.resolveById({
          pricing_id: pricing.pricing_id,
          currency: pricing.currency,
          usage: actualUsage,
        });
  }

  const modalActualSupplierCost = await settleModalActualSupplierCost({
    organizationId,
    usageId,
    approvalId,
    settlementCurrency: settlementCurrency || resolved.currency || pricing.currency,
    result,
    effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
  });

  if (!modalActualSupplierCost) return resolved;

  return {
    ...resolved,
    supplier_cost: modalActualSupplierCost.supplier_cost,
    actual_supplier_cost: modalActualSupplierCost,
    pricing_metadata: {
      ...(resolved.pricing_metadata || {}),
      actual_supplier_cost_contract: modalActualSupplierCost.contract,
      actual_supplier_cost_source: "MODAL_ELAPSED_SECONDS_X_PUBLISHED_H100_RATE",
    },
  };
}

async function walletGate({
  organizationId,
  provider,
  usageId,
  pricing,
}) {
  const amount = finite(pricing?.customer_price);

  if (amount > 0) {
    await WalletRuntime.reserve({
      organization_id: organizationId,
      amount,
      provider,
      reference: usageId,
      currency: pricing.currency,
      metadata: {
        usage_id: usageId,
        pricing_id: pricing.pricing_id,
        estimated: pricing.estimated === true,
      },
    });

    return {
      mode: "RESERVED",
      reserved_amount: amount,
    };
  }

  if (pricing?.zero_price !== true) {
    throw new Error("SERVICE_ZERO_PRICE_MUST_BE_EXPLICIT");
  }

  if (
    pricing?.pricing_metadata?.customer_direct_provider_billing_allowed === true &&
    pricing?.pricing_metadata?.external_provider_billing === true
  ) {
    return {
      mode: "CUSTOMER_DIRECT_PROVIDER_BILLING_ZERO_AVANTIQO_CHARGE",
      reserved_amount: 0,
      wallet_id: null,
    };
  }

  const wallet = await WalletRuntime.getOrCreate({
    organization_id: organizationId,
    currency: pricing.currency,
  });

  return {
    mode: "ZERO_PRICE_WALLET_CHECK",
    reserved_amount: 0,
    wallet_id: wallet?.id || null,
  };
}

async function ensureGovernedReservationCoverage({
  organizationId,
  provider,
  usageId,
  currency,
  reservedAmount,
  chargeAmount,
  usageMetadata = {},
}) {
  const reserved = finite(reservedAmount);
  const charge = finite(chargeAmount);
  if (charge <= reserved) {
    return { reserved_amount: reserved, top_up_amount: 0, topped_up: false };
  }

  const approvedMaximum = finite(
    usageMetadata?.service_cost_guard_maximum_customer_price,
  );
  if (approvedMaximum <= 0 || charge > approvedMaximum + 0.000001) {
    throw new Error(
      `SERVICE_ACTUAL_PRICE_EXCEEDS_RESERVATION:${charge}:${reserved}`,
    );
  }

  const topUp = Number((charge - reserved).toFixed(6));
  await WalletRuntime.reserve({
    organization_id: organizationId,
    amount: topUp,
    provider,
    reference: `${usageId}:actual-usage-topup`,
    idempotency_key: `${usageId}:actual-usage-topup`,
    currency,
    metadata: {
      usage_id: usageId,
      settlement: "ACTUAL_USAGE_GOVERNED_RESERVATION_TOPUP",
      original_reserved_amount: reserved,
      actual_charge_amount: charge,
      approved_maximum_customer_price: approvedMaximum,
    },
  });

  return {
    reserved_amount: Number((reserved + topUp).toFixed(6)),
    top_up_amount: topUp,
    topped_up: true,
    approved_maximum_customer_price: approvedMaximum,
  };
}

async function settleReservation({
  organizationId,
  provider,
  usageId,
  reservedAmount,
  chargeAmount,
  maximumChargeAmount = null,
  currency = null,
}) {
  const reserved = finite(reservedAmount);
  const charge = finite(chargeAmount);
  const authorizedMaximum =
    maximumChargeAmount === null || maximumChargeAmount === undefined
      ? null
      : finite(maximumChargeAmount);

  if (reserved === 0 && charge === 0) {
    return {
      reserved_amount: 0,
      charged_amount: 0,
      released_amount: 0,
      remaining_reserved_amount: 0,
      mode: "ZERO_PRICE_WALLET_CHECK",
    };
  }

  if (reserved <= 0 || charge <= 0) {
    throw new Error("SERVICE_SETTLEMENT_AMOUNT_MUST_BE_POSITIVE");
  }
  let effectiveReserved = reserved;
  let reservationTopUp = 0;
  if (charge > effectiveReserved) {
    if (authorizedMaximum === null || charge > authorizedMaximum) {
      throw new Error(
        `SERVICE_ACTUAL_PRICE_EXCEEDS_RESERVATION:${charge}:${effectiveReserved}`,
      );
    }
    const topUp = Number((charge - effectiveReserved).toFixed(6));
    reservationTopUp = topUp;
    if (topUp > 0) {
      await WalletRuntime.reserve({
        organization_id: organizationId,
        amount: topUp,
        provider,
        reference: `${usageId}:settlement-top-up`,
        currency,
        metadata: {
          usage_id: usageId,
          settlement: "ACTUAL_USAGE_TOP_UP",
          original_reserved_amount: effectiveReserved,
          actual_charge_amount: charge,
          authorized_maximum_amount: authorizedMaximum,
        },
      });
      effectiveReserved = charge;
    }
  }

  let remaining = effectiveReserved;
  const unused = Number((effectiveReserved - charge).toFixed(6));

  if (unused > 0) {
    await WalletRuntime.release({
      organization_id: organizationId,
      amount: unused,
      provider,
      reference: `${usageId}:unused-reservation`,
      currency: null,
      metadata: {
        usage_id: usageId,
        settlement: "ACTUAL_USAGE_DIFFERENCE",
      },
    });
    remaining = charge;
  }

  await WalletRuntime.charge({
    organization_id: organizationId,
    amount: charge,
    provider,
    usage_id: usageId,
    reference: usageId,
    metadata: {
      reserved_amount: effectiveReserved,
      initial_reserved_amount: reserved,
      reservation_top_up: reservationTopUp,
      actual_charge_amount: charge,
      released_amount: unused,
    },
  });
  remaining = 0;

  return {
    reserved_amount: effectiveReserved,
    charged_amount: charge,
    released_amount: unused,
    remaining_reserved_amount: remaining,
    mode: "CHARGED",
  };
}

function localOwnedCodePreviewPricing(pricing = {}, {
  provider = null,
  capability = null,
  policy = {},
} = {}) {
  const allowed = Boolean(
    String(process.env.NODE_ENV || "").trim().toLowerCase() === "development" &&
    String(provider || "").trim() === "avantiqo-code" &&
    String(capability || "").trim() === "ai.code.debug" &&
    pricing?.benchmark_review_preview === true &&
    policy?.execution_scope === "BENCHMARK_REVIEW_PREVIEW" &&
    policy?.benchmark_only === true &&
    policy?.owned_only_required === true &&
    policy?.external_fallback_allowed === false &&
    policy?.studio_preproduction_review === true &&
    policy?.local_owned_zero_price_preview === true
  );
  if (!allowed) return pricing;
  return {
    ...pricing,
    supplier_cost: 0,
    platform_markup: 0,
    customer_price: 0,
    unit_cost: 0,
    zero_price: true,
    estimated: false,
    pricing_metadata: {
      ...(pricing?.pricing_metadata || {}),
      allow_zero_price: true,
      zero_price: true,
      pricing_mode: "ZERO_PRICE",
      local_owned_zero_price_preview: true,
      production_routing_allowed: false,
    },
  };
}

function localOwnedInternalCreativeIntelligencePricing(pricing = {}, {
  provider = null,
  capability = null,
  payload = {},
  metadata = {},
} = {}) {
  const localOnly = Boolean(
    provider === "avantiqo-intelligence" &&
    ["ai.reasoning.execute", "ai.text.generate"].includes(String(capability || "").trim()) &&
    payload?.local_compute_required === true &&
    String(payload?.infrastructure_policy || "").trim().toLowerCase() === "local_only" &&
    payload?.external_fallback_allowed === false &&
    metadata?.internal_creative_local_authority === true &&
    metadata?.external_provider_authorized === false
  );
  if (!localOnly) return pricing;
  return {
    ...pricing,
    model: AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
    supplier_cost: 0,
    platform_markup: 0,
    customer_price: 0,
    unit_cost: 0,
    zero_price: true,
    estimated: false,
    pricing_metadata: {
      ...(pricing?.pricing_metadata || {}),
      pricing_mode: "ZERO_PRICE",
      pricing_contract: "AVANTIQO_OWNED_ZERO_MARGINAL_V1",
      allow_zero_price: true,
      zero_price: true,
      owned_inference: true,
      supplier_billing_required: false,
      provider_supplier_account_verification_required: false,
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      external_fallback_allowed: false,
      internal_creative_local_authority: true,
    },
  };
}

function failoverCleanupError(code, cause) {
  const error = new Error(code);
  if (cause) error.cause = cause;
  return error;
}

async function intelligencePricingPolicy({
  executionCapability,
  payload = {},
  providerId = null,
  country = null,
  currency = null,
  policy = {},
} = {}) {
  if (!["ai.reasoning.execute", "ai.text.generate"].includes(String(executionCapability || "").trim())) return policy;
  if (providerId && providerId !== "avantiqo-intelligence") return policy;

  const explicitAllowed = Array.isArray(policy.allowed_models) ? policy.allowed_models.filter(Boolean) : [];
  const explicitPreferred = Array.isArray(policy.preferred_models) ? policy.preferred_models.filter(Boolean) : [];
  const explicitModalApprovalId = String(
    payload.modal_compute_approval_id ||
    payload.modalComputeApprovalId ||
    payload.metadata?.modal_compute_approval_id ||
    payload.metadata?.modalComputeApprovalId ||
    policy.modal_compute_approval_id ||
    policy.modalComputeApprovalId ||
    ""
  ).trim();
  const explicitlyRequestsOtherModel =
    Boolean(explicitModalApprovalId) && (
      (explicitAllowed.length && !explicitAllowed.includes(AVANTIQO_INTELLIGENCE_LOCAL_MODEL)) ||
      (explicitPreferred.length && !explicitPreferred.includes(AVANTIQO_INTELLIGENCE_LOCAL_MODEL))
    );

  const benchmarkLocalPreview =
    String(policy.execution_scope || "").trim().toUpperCase() === "BENCHMARK_REVIEW_PREVIEW" &&
    policy.benchmark_only === true &&
    policy.owned_only_required === true &&
    policy.external_fallback_allowed === false &&
    policy.studio_preproduction_review === true &&
    explicitAllowed.includes(AVANTIQO_INTELLIGENCE_LOCAL_MODEL);

  const intelligenceLane = String(payload.execution_lane || payload.executionLane || "").trim().toLowerCase() ||
    (executionCapability === "ai.text.generate" ? "fast" : "deep");
  const localLaneEligible = ["front", "fast", "deep"].includes(intelligenceLane);

  const localExecutionEligible =
    localLaneEligible &&
    !explicitlyRequestsOtherModel &&
    (
      shouldUseLocalIntelligenceQueue({
        ...payload,
        capability: executionCapability,
        execution_lane: intelligenceLane,
      }) ||
      shouldUseHierarchicalLocalIntelligence({
        ...payload,
        capability: executionCapability,
        execution_lane: intelligenceLane,
      })
    );

  let localReady = false;
  if (localExecutionEligible) {
    try {
      const health = await getIntelligenceLocalQueueHealth({
        ...payload,
        capability: executionCapability,
        execution_lane: intelligenceLane,
      });
      if (health?.ready === true) {
        if (benchmarkLocalPreview) {
          localReady = true;
        } else {
          const localPricing = await getProviderPricing({
            provider: "avantiqo-intelligence",
            capability: executionCapability,
            model: AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
            country,
            currency,
          });
          localReady = localPricing?.active === true;
        }
      }
    } catch {
      localReady = false;
    }
  }

  if (localReady) {
    return {
      ...policy,
      allowed_models: [AVANTIQO_INTELLIGENCE_LOCAL_MODEL],
      preferred_models: [AVANTIQO_INTELLIGENCE_LOCAL_MODEL],
      external_fallback_allowed: false,
      allow_owned_reasoning_fallback: false,
      local_owned_pricing_required: true,
      local_first_override_applied: explicitModalApprovalId ? false : true,
    };
  }

  return {
    ...policy,
    blocked_models: [...new Set([...(Array.isArray(policy.blocked_models) ? policy.blocked_models : []), AVANTIQO_INTELLIGENCE_LOCAL_MODEL])],
  };
}

export async function executeService(input = {}) {
  const {
    organization_id,
    party_id = null,
    entity_id = null,
    service_id,
    provider_id = null,
    credential_id = null,
    input: payload = {},
    metadata = {},
    category = "SERVICE",
    provider_policy = {},
  } = input;

  if (!organization_id) throw new Error("organization_id required");
  if (!service_id) throw new Error("service_id required");

  const organizationService = await OrganizationServiceRuntime.get({
    organization_id,
    service_id,
  });
  if (!organizationService) {
    throw new Error(`Service ${service_id} is not enabled for organization`);
  }

  if (String(organizationService.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error(`Service ${service_id} is not active for organization`);
  }
  if (organizationService.usage_enabled === false) {
    throw new Error(`Service ${service_id} usage is disabled for organization`);
  }

  const serviceCapabilities = resolveServiceCapabilities(service_id);
  if (!serviceCapabilities?.capabilities?.length) {
    throw new Error(`No enabled capability mapping found for ${service_id}`);
  }

  const requestedCapability = String(
    input.capability || payload.capability || ""
  ).trim();
  const resolvedCapabilities = serviceCapabilities.capabilities || [];
  const executionCapability = requestedCapability
    ? requestedCapability
    : resolvePrimaryExecutionCapability(resolvedCapabilities);

  if (!executionCapability) {
    throw new Error(`No execution capability found for ${service_id}`);
  }

  if (
    requestedCapability &&
    !resolvedCapabilities.includes(requestedCapability)
  ) {
    throw new Error(
      `Capability ${requestedCapability} is not enabled for service ${service_id}`
    );
  }

  const country = payload.country ?? input.country ?? null;
  const currency = payload.currency ?? input.currency ?? null;
  const baseProviderPolicy = {
    ...(organizationService.provider_policy || {}),
    ...(provider_policy || {}),
  };
  const effectiveProviderPolicy = await intelligencePricingPolicy({
    executionCapability,
    payload,
    providerId: provider_id,
    country,
    currency,
    policy: baseProviderPolicy,
  });
  const selectedProvider = await resolveProvider({
    organization_id,
    capability: executionCapability,
    preferredProvider: provider_id,
    country,
    currency,
    policy: effectiveProviderPolicy,
  });
  const provider = selectedProvider.provider;
  const model = selectedProvider.model;
  const pricingRecord = await localOwnedCodePreviewPricingRecord({
    selectedProvider,
    pricingRecord: selectedProvider.pricing_record,
    capability: executionCapability,
    policy: effectiveProviderPolicy,
  });
  const quantity = resolveExecutionQuantity({
    payload,
    input,
    unit: pricingRecord?.unit,
  });
  const pricingDimensions = resolvePricingDimensions(payload);
  const resolvedPricing = PricingRuntime.resolveRecord({
    pricing: pricingRecord,
    provider,
    model,
    capability: executionCapability,
    currency,
    usage: { quantity, ...pricingDimensions },
  });
  const pricing = localOwnedInternalCreativeIntelligencePricing(
    localOwnedCodePreviewPricing(resolvedPricing, {
      provider,
      capability: executionCapability,
      policy: effectiveProviderPolicy,
    }),
    {
      provider,
      capability: executionCapability,
      payload,
      metadata,
    },
  );
  const unit = pricing.unit || "request";
  const intelligenceExecutionLane = ["ai.reasoning.execute", "ai.text.generate"].includes(executionCapability)
    ? (String(payload.execution_lane || payload.executionLane || metadata?.intelligence_execution_lane || "").trim().toLowerCase()
      || (executionCapability === "ai.text.generate" ? "fast" : "deep"))
    : null;
  const intelligenceLocalLaneEligible = ["front", "fast", "deep"].includes(intelligenceExecutionLane);
  const routingEvidence = {
    contract: "AVANTIQO_SERVICE_ROUTING_EVIDENCE_V1",
    execution_lane: intelligenceExecutionLane,
    supervisor_mode: metadata?.supervisor_mode || null,
    structured_supervisor_mode: metadata?.structured_supervisor_mode || null,
    local_lane_eligible: intelligenceLocalLaneEligible,
    selected_provider: provider,
    selected_model: model,
    local_owned_pricing_selected: effectiveProviderPolicy?.local_owned_pricing_required === true,
  };
  const providerCertificationFingerprint =
    CreativeProviderExecutionClaimRuntime.certificationFingerprint(
      selectedProvider.metadata?.owned_execution_certification || {},
    );
  const providerExecutionKey = CreativeProviderExecutionClaimRuntime.key({
    task_id: metadata?.task_id || null,
    capability: executionCapability,
    metadata,
  });
  const providerExecutionRequestHash = providerExecutionKey
    ? CreativeProviderExecutionClaimRuntime.requestHash({
        organization_id,
        task_id: metadata?.task_id || null,
        service_id,
        capability: executionCapability,
        provider,
        model,
        payload,
        metadata: {
          ...metadata,
          provider_certification_fingerprint:
            providerCertificationFingerprint,
        },
      })
    : null;
  const providerExecutionClaim = providerExecutionKey
    ? await CreativeProviderExecutionClaimRuntime.claim({
        organization_id,
        task_id: metadata?.task_id || null,
        execution_key: providerExecutionKey,
        request_hash: providerExecutionRequestHash,
        capability: executionCapability,
        metadata: {
          service_id,
          provider,
          model,
          routing_evidence: routingEvidence,
          provider_certification_fingerprint:
            providerCertificationFingerprint,
          provider_certification:
            selectedProvider.metadata?.owned_execution_certification || null,
        },
      })
    : null;
  if (
    providerExecutionClaim?.required === true &&
    providerExecutionClaim.submission_allowed !== true
  ) {
    throw new Error(
      "CREATIVE_PROVIDER_EXECUTION_REPLAY_BLOCKED:" +
      String(providerExecutionClaim.status || "UNKNOWN") +
      ":" +
      String(providerExecutionClaim.claim_id || "UNKNOWN"),
    );
  }
  const usage = await UsageRuntime.start({
    organization_id,
    bill_to_organization_id:
      input.bill_to_organization_id || organization_id,
    party_id,
    entity_id,
    organization_service_id: organizationService.id,
    pricing_id: pricing.pricing_id,
    category,
    provider,
    capability: executionCapability,
    operation: executionCapability,
    currency: pricing.currency,
    quantity,
    unit,
    metadata: {
      ...metadata,
      service_id,
      model,
      pricing_dimensions: pricingDimensions,
      provider_selection: selectedProvider.selection_evidence || null,
      routing_evidence: routingEvidence,
      reservation_pricing: pricing,
      provider_execution_claim_id: providerExecutionClaim?.claim_id || null,
      provider_execution_key: providerExecutionKey,
      provider_execution_request_hash: providerExecutionRequestHash,
      provider_execution_exactly_once_contract:
        providerExecutionKey
          ? CreativeProviderExecutionClaimRuntime.contract
          : null,
      provider_certification_fingerprint:
        providerCertificationFingerprint,
      provider_certification:
        selectedProvider.metadata?.owned_execution_certification || null,
    },
  });

  if (
    metadata?.code_ai_runtime_recovery_active === true &&
    String(usage?.status || "").toUpperCase() === "SUCCESS" &&
    usage?.metadata?.provider_result &&
    typeof usage.metadata.provider_result === "object"
  ) {
    return {
      success: true,
      pending: false,
      failed: false,
      provider,
      model,
      pricing: usage.metadata?.settled_pricing || pricing,
      usage,
      credential_id: selectedProvider.credential_id || null,
      settlement:
        finite(usage.customer_price) > 0
          ? "CHARGED"
          : "ZERO_PRICE_WALLET_CHECKED",
      replayed_completed_usage: true,
      output: usage.metadata.provider_result,
    };
  }

  const startedAt = Date.now();
  let gate;
  try {
    gate = await walletGate({
      organizationId: organization_id,
      provider,
      usageId: usage.id,
      pricing,
    });
  } catch (error) {
    if (providerExecutionClaim?.claim_id) {
      await CreativeProviderExecutionClaimRuntime.failedPreSubmission({
        claim_id: providerExecutionClaim.claim_id,
        reason: error?.message || "WALLET_GATE_FAILED",
      }).catch(() => null);
    }
    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        service_id,
        model,
        provider,
        wallet_gate_failed: true,
      },
    }).catch(() => null);
    throw error;
  }

  let reservationRemaining = gate.reserved_amount;
  let providerCallStarted = false;
  let providerCallReturned = false;

  try {
    if (providerExecutionClaim?.claim_id) {
      await CreativeProviderExecutionClaimRuntime.submitting({
        claim_id: providerExecutionClaim.claim_id,
      });
    }
    providerCallStarted = true;
    const result = await executeProvider({
      provider,
      capability: executionCapability,
      model,
      input: {
        ...payload,
        ...(providerExecutionKey
          ? {
              execution_idempotency_key: providerExecutionKey,
              request_idempotency_key: providerExecutionKey,
            }
          : {}),
      },
      context: {
        organization_id,
        party_id,
        entity_id,
        credential_id: credential_id || selectedProvider.credential_id || null,
        organization_service_id: organizationService.id,
        country,
        currency: pricing.currency,
        usage_id: usage.id,
      },
    });
    providerCallReturned = true;
    const state = executionState(result);

    if (providerExecutionClaim?.claim_id) {
      await CreativeProviderExecutionClaimRuntime.submitted({
        claim_id: providerExecutionClaim.claim_id,
        provider,
        model,
        usage_id: usage.id,
        provider_job_id: state.job_id || null,
      });
    }

    if (state.pending) {
      if (!state.job_id) {
        throw new Error("PROVIDER_PENDING_JOB_ID_REQUIRED");
      }

      const pendingUsage = await UsageRuntime.bindPendingProviderExecution({
        usage_id: usage.id,
        provider_request_id: state.job_id,
        provider_status: state.provider_status || "PENDING",
        metadata: {
          ...metadata,
          service_id,
          model,
          provider,
          pricing_dimensions: pricingDimensions,
          reservation_pricing: pricing,
          modal_compute_approval_id:
            result?.output?.modal_compute_approval_id ||
            result?.modal_compute_approval_id ||
            metadata?.modal_compute_approval_id ||
            null,
        },
      });

      reservationRemaining = 0;
      return {
        success: true,
        pending: true,
        provider,
        model,
        pricing,
        usage: pendingUsage,
        credential_id: selectedProvider.credential_id || null,
        settlement: gate.mode,
        wallet_gate: gate,
        provider_job_id: state.job_id,
        provider_status: state.provider_status,
        started_at: new Date(startedAt).toISOString(),
        output: result,
      };
    }

    if (state.failed) {
      throw new Error(failureMessage(result, state));
    }

    let settledPricing = await actualPricing({
      pricing,
      result,
      pricingRecord,
      quantity,
      pricingDimensions,
      organizationId: organization_id,
      usageId: usage.id,
      approvalId:
        result?.output?.modal_compute_approval_id ||
        result?.modal_compute_approval_id ||
        metadata?.modal_compute_approval_id ||
        null,
      settlementCurrency: pricing.currency,
    });
    const overflowSupplier = await applyIntelligenceModalOverflowSupplierSettlement({
      provider,
      organizationId: organization_id,
      providerJobId: state.job_id || null,
      settledPricing,
    });
    settledPricing = overflowSupplier.pricing;
    const settlement = await settleReservation({
      organizationId: organization_id,
      provider,
      usageId: usage.id,
      reservedAmount: gate.reserved_amount,
      chargeAmount: settledPricing.customer_price,
      maximumChargeAmount: metadata?.service_cost_guard_maximum_customer_price ?? null,
      currency: pricing.currency,
    });
    reservationRemaining = 0;

    const completedUsage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: settledPricing.supplier_cost,
      platform_markup: settledPricing.platform_markup,
      customer_price: settledPricing.customer_price,
      quantity: settledPricing.quantity,
      unit: settledPricing.unit || unit,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        service_id,
        model,
        result,
        pricing_dimensions: pricingDimensions,
        provider_usage: providerUsage(result),
        reservation_quantity: quantity,
        settled_quantity: settledPricing.quantity,
        reservation_pricing: pricing,
        settled_pricing: settledPricing,
        intelligence_modal_overflow_supplier_settlement: overflowSupplier.overflow_supplier_settlement,
        wallet_gate: gate,
        wallet_settlement: settlement,
      },
    });

    const billing = settledPricing.customer_price > 0 &&
      organizationService.billing_enabled !== false
      ? await BillingRuntime.billUsage({
          usage_id: completedUsage.id,
        })
      : null;

    if (providerExecutionClaim?.claim_id) {
      await CreativeProviderExecutionClaimRuntime.completed({
        claim_id: providerExecutionClaim.claim_id,
        provider,
        model,
        usage_id: completedUsage.id,
        provider_job_id: state.job_id || null,
      });
    }

    return {
      success: true,
      pending: false,
      provider,
      model,
      pricing: settledPricing,
      reservation_pricing: pricing,
      usage: billing?.usage || completedUsage,
      billing,
      settlement:
        settledPricing.customer_price > 0
          ? "CHARGED"
          : "ZERO_PRICE_WALLET_CHECKED",
      wallet_gate: gate,
      wallet_settlement: settlement,
      output: result,
    };
  } catch (error) {
    if (
      providerExecutionClaim?.claim_id &&
      providerCallStarted === true &&
      providerCallReturned !== true
    ) {
      await CreativeProviderExecutionClaimRuntime.ambiguous({
        claim_id: providerExecutionClaim.claim_id,
        reason: error?.message || "PROVIDER_SUBMISSION_STATE_UNKNOWN",
      }).catch(() => null);
    }
    const fallbackDecision = ownedReasoningFallbackDecision({
      error,
      provider,
      capability: executionCapability,
      providerPolicy: effectiveProviderPolicy,
      metadata,
    });

    try {
      await UsageRuntime.fail({
        usage_id: usage.id,
        error,
        latency_ms: Date.now() - startedAt,
        metadata: {
          ...metadata,
          service_id,
          model,
          provider,
          wallet_gate: gate,
          provider_failover_candidate: {
            allowed: fallbackDecision.allowed === true,
            reason: fallbackDecision.reason,
          },
        },
      });
    } catch (usageFailureError) {
      if (fallbackDecision.allowed === true) {
        throw failoverCleanupError(
          "SERVICE_FAILOVER_USAGE_FINALIZATION_FAILED",
          usageFailureError,
        );
      }
    }

    if (reservationRemaining > 0) {
      try {
        await WalletRuntime.release({
          organization_id,
          amount: reservationRemaining,
          provider,
          reference: usage.id,
          currency: pricing.currency,
          metadata: {
            usage_id: usage.id,
            settlement: fallbackDecision.allowed === true
              ? "FAILED_ATTEMPT_BEFORE_PROVIDER_FAILOVER"
              : "FAILED_PROVIDER_EXECUTION",
          },
        });
        reservationRemaining = 0;
      } catch (releaseError) {
        if (fallbackDecision.allowed === true) {
          throw failoverCleanupError(
            "SERVICE_FAILOVER_RESERVATION_RELEASE_FAILED",
            releaseError,
          );
        }
      }
    }

    if (fallbackDecision.allowed === true) {
      const fallbackInput = buildOwnedReasoningFallbackInput({
        input,
        decision: fallbackDecision,
        failedUsageId: usage.id,
        failedProvider: provider,
        failedModel: model,
      });
      const fallbackResult = await executeService(fallbackInput);
      return {
        ...fallbackResult,
        provider_failover: ownedReasoningFallbackEvidence({
          failedUsageId: usage.id,
          failedProvider: provider,
          failedModel: model,
          decision: fallbackDecision,
          result: fallbackResult,
        }),
      };
    }

    throw error;
  }
}

export async function cancelPendingService(input = {}) {
  const {
    organization_id,
    provider,
    provider_job_id,
    usage_id,
    pricing = {},
    metadata = {},
    credential_id = null,
  } = input;

  if (!organization_id) throw new Error("organization_id required");
  if (!provider) throw new Error("provider required");
  if (!provider_job_id) throw new Error("provider_job_id required");
  if (!usage_id) throw new Error("usage_id required");

  const usage = await UsageRuntime.get(usage_id);
  if (!usage || usage.organization_id !== organization_id) {
    throw new Error("Service usage not found");
  }
  if (usage.provider && usage.provider !== provider) {
    throw new Error("Provider does not match reserved usage");
  }
  if (["SUCCESS", "FAILED"].includes(String(usage.status || "").toUpperCase())) {
    return {
      success: true,
      cancelled: false,
      already_terminal: true,
      terminal_status: String(usage.status || "").toUpperCase(),
      provider_job_id,
      usage_id,
      reservation_released: false,
      released_amount: 0,
    };
  }

  const cancellation = await cancelProvider({
    provider,
    job_id: provider_job_id,
    input: {
      cancellation_reason: input.reason || "SERVICE_PENDING_EXECUTION_TIMEOUT",
      execution_lane: input.execution_lane || metadata?.intelligence_execution_lane || null,
    },
    context: { organization_id, credential_id, usage_id },
  });
  const reservationPricing = Object.keys(pricing || {}).length
    ? pricing
    : usage.metadata?.reservation_pricing || {};
  const reservedAmount = finite(
    usage.reserved_amount ?? reservationPricing.customer_price ?? 0,
  );
  const cancellationError = new Error(
    String(input.reason || "SERVICE_PENDING_EXECUTION_CANCELLED"),
  );

  if (usage.metadata?.provider_execution_claim_id) {
    await CreativeProviderExecutionClaimRuntime.failedTerminal({
      claim_id: usage.metadata.provider_execution_claim_id,
      reason: input.reason || "SERVICE_PENDING_EXECUTION_CANCELLED",
    }).catch(() => null);
  }
  await UsageRuntime.fail({
      usage_id,
      error: cancellationError,
      metadata: {
        ...(usage.metadata || {}),
        ...metadata,
        provider_job_id,
        exact_provider_job_cancelled: cancellation?.cancelled === true,
        cancellation_exact_job_only: cancellation?.exact_job_only === true,
      },
    });
  if (reservedAmount > 0) {
    await WalletRuntime.release({
      organization_id,
      amount: reservedAmount,
      provider,
      reference: usage_id,
      currency: usage.currency,
      metadata: {
        provider_job_id,
        cancellation_release: true,
      },
    });
  }

  return {
    success: true,
    cancelled: cancellation?.cancelled === true,
    provider_job_id,
    usage_id,
    reservation_released: reservedAmount > 0,
    released_amount: reservedAmount,
    exact_job_only: cancellation?.exact_job_only === true,
  };
}

export async function settlePendingService(input = {}) {
  const {
    organization_id,
    provider,
    provider_job_id,
    usage_id,
    pricing = {},
    quantity = null,
    unit = null,
    metadata = {},
    provider_status_input = {},
    credential_id = null,
    started_at = null,
  } = input;

  if (!organization_id) throw new Error("organization_id required");
  if (!provider) throw new Error("provider required");
  if (!provider_job_id) throw new Error("provider_job_id required");
  if (!usage_id) throw new Error("usage_id required");

  const usage = await UsageRuntime.get(usage_id);
  if (!usage || usage.organization_id !== organization_id) {
    throw new Error("Service usage not found");
  }
  if (usage.provider && usage.provider !== provider) {
    throw new Error("Provider does not match reserved usage");
  }

  const reservationPricing = Object.keys(pricing || {}).length
    ? pricing
    : usage.metadata?.reservation_pricing || {};
  const reservedAmount = finite(
    reservationPricing.customer_price || usage.metadata?.reservation_pricing?.customer_price,
  );

  const result = await getProviderStatus({
    provider,
    job_id: provider_job_id,
    input: provider_status_input,
    context: {
      organization_id,
      credential_id,
      usage_id,
    },
  });
  const state = executionState(result);

  if (state.failed) {
    const error = new Error(failureMessage(result, state));
    if (usage.metadata?.provider_execution_claim_id) {
      await CreativeProviderExecutionClaimRuntime.failedTerminal({
        claim_id: usage.metadata.provider_execution_claim_id,
        reason: error.message,
      }).catch(() => null);
    }
    if (usage.status !== "FAILED" && usage.status !== "SUCCESS") {
      await UsageRuntime.fail({
        usage_id,
        error,
        latency_ms: latencyFrom(started_at),
        metadata: {
          ...(usage.metadata || {}),
          ...metadata,
          provider_job_id,
          provider_status: state.provider_status,
          provider_result: result,
        },
      });
      if (reservedAmount > 0) {
        await WalletRuntime.release({
          organization_id,
          amount: reservedAmount,
          provider,
          reference: usage_id,
          currency: usage.currency,
        });
      }
    }

    return {
      success: false,
      pending: false,
      failed: true,
      provider,
      provider_job_id,
      provider_status: state.provider_status,
      settlement: usage.status === "SUCCESS" ? "CHARGED" : "RELEASED",
      error: error.message,
      output: result,
    };
  }

  if (state.pending || !state.completed) {
    return {
      success: true,
      pending: true,
      failed: false,
      provider,
      provider_job_id,
      provider_status: state.provider_status || "unknown",
      settlement: reservedAmount > 0 ? "RESERVED" : "ZERO_PRICE_WALLET_CHECKED",
      output: result,
    };
  }

  if (usage.status === "SUCCESS") {
    if (usage.metadata?.provider_execution_claim_id) {
      await CreativeProviderExecutionClaimRuntime.completed({
        claim_id: usage.metadata.provider_execution_claim_id,
        provider,
        model: usage.metadata?.model || null,
        usage_id,
        provider_job_id,
      }).catch(() => null);
    }
    return {
      success: true,
      pending: false,
      failed: false,
      provider,
      provider_job_id,
      provider_status: state.provider_status || "completed",
      pricing: usage.metadata?.settled_pricing || reservationPricing,
      usage,
      settlement:
        finite(usage.customer_price) > 0
          ? "CHARGED"
          : "ZERO_PRICE_WALLET_CHECKED",
      output: result,
    };
  }

  const resolvedQuantityRaw = Number(quantity ?? usage.quantity ?? 1);
  const resolvedQuantity = Number.isFinite(resolvedQuantityRaw) && resolvedQuantityRaw > 0
    ? resolvedQuantityRaw
    : 1;
  let settledPricing = await actualPricing({
    pricing: reservationPricing,
    result,
    quantity: resolvedQuantity,
    pricingDimensions: usage.metadata?.pricing_dimensions || {},
    organizationId: organization_id,
    usageId: usage_id,
    approvalId: usage.metadata?.modal_compute_approval_id || null,
    settlementCurrency: usage.currency || reservationPricing.currency,
    effectiveDate: String(usage.created_at || new Date().toISOString()).slice(0, 10),
  });
  const overflowSupplier = await applyIntelligenceModalOverflowSupplierSettlement({
    provider,
    organizationId: organization_id,
    providerJobId: provider_job_id,
    settledPricing,
  });
  settledPricing = applyOwnedLocalSupplierSettlement({
    provider,
    providerJobId: provider_job_id,
    settledPricing: overflowSupplier.pricing,
    result,
  });
  const settledQuantity = positiveNumber(settledPricing.quantity) || resolvedQuantity;
  const resolvedUnit = settledPricing.unit || unit || usage.unit || "request";
  const reservationCoverage = await ensureGovernedReservationCoverage({
    organizationId: organization_id,
    provider,
    usageId: usage_id,
    currency: usage.currency || reservationPricing.currency,
    reservedAmount,
    chargeAmount: settledPricing.customer_price,
    usageMetadata: usage.metadata || {},
  });
  const settlement = await settleReservation({
    organizationId: organization_id,
    provider,
    usageId: usage_id,
    reservedAmount: reservationCoverage.reserved_amount,
    chargeAmount: settledPricing.customer_price,
    maximumChargeAmount: usage.metadata?.service_cost_guard_maximum_customer_price ?? null,
    currency: reservationPricing.currency || usage.currency || settledPricing.currency || null,
  });

  const completedUsage = await UsageRuntime.complete({
    usage_id,
    supplier_cost: settledPricing.supplier_cost,
    platform_markup: settledPricing.platform_markup,
    customer_price: settledPricing.customer_price,
    quantity: settledQuantity,
    unit: resolvedUnit,
    latency_ms: latencyFrom(started_at),
    metadata: {
      ...(usage.metadata || {}),
      ...metadata,
      provider_job_id,
      provider_status: state.provider_status,
      provider_result: result,
      provider_usage: providerUsage(result),
      reservation_quantity: resolvedQuantity,
      settled_quantity: settledQuantity,
      reservation_pricing: reservationPricing,
      settled_pricing: settledPricing,
      intelligence_modal_overflow_supplier_settlement: overflowSupplier.overflow_supplier_settlement,
      reservation_coverage: reservationCoverage,
      wallet_settlement: settlement,
    },
  });

  const billing = settledPricing.customer_price > 0
    ? await BillingRuntime.billUsage({
        usage_id: completedUsage.id,
      })
    : null;

  if (usage.metadata?.provider_execution_claim_id) {
    await CreativeProviderExecutionClaimRuntime.completed({
      claim_id: usage.metadata.provider_execution_claim_id,
      provider,
      model: usage.metadata?.model || null,
      usage_id: completedUsage.id,
      provider_job_id,
    });
  }

  return {
    success: true,
    pending: false,
    failed: false,
    provider,
    provider_job_id,
    provider_status: state.provider_status || "completed",
    pricing: settledPricing,
    reservation_pricing: reservationPricing,
    usage: billing?.usage || completedUsage,
    billing,
    settlement:
      settledPricing.customer_price > 0
        ? "CHARGED"
        : "ZERO_PRICE_WALLET_CHECKED",
    wallet_settlement: settlement,
    output: {
      url: state.media_url,
      provider_job_id,
      status: state.provider_status || "completed",
      raw: result,
    },
  };
}

export const ServiceExecutionRuntime = {
  execute: executeService,
  settle: settlePendingService,
  cancelPending: cancelPendingService,
};
