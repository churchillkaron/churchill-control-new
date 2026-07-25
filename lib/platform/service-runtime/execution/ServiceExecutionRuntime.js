import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";

import {
  resolveProvider,
} from "../providers/ProviderResolver";

import {
  executeProvider,
  validateProviderExecution,
} from "../providers/ProviderExecutor";

import {
  PricingRuntime,
} from "../pricing/PricingRuntime";

import {
  WalletRuntime,
} from "../wallet/runtime/WalletRuntime";

import {
  UsageRuntime,
} from "../usage/UsageRuntime";

import {
  BillingRuntime,
} from "../billing/runtime/BillingRuntime";

import {
  resolveServiceCapabilities,
} from "../services/resolver/ServiceCapabilityResolver";

import {
  resolvePrimaryExecutionCapability,
} from "../services/resolver/CapabilityExecutionResolver";

function executionState(result = {}) {
  const output = result?.output || result || {};
  const status = String(
    output.status ||
    result.status ||
    "",
  ).toLowerCase();
  const jobId =
    output.job_id ||
    output.task_id ||
    output.request_id ||
    output.video_job_id ||
    result.job_id ||
    null;
  const mediaUrl =
    output.url ||
    output.file_url ||
    output.image_url ||
    output.video_url ||
    output.audio_url ||
    result.url ||
    null;
  const pendingStatuses = new Set([
    "pending",
    "queued",
    "submitted",
    "processing",
    "running",
    "in_progress",
  ]);

  return {
    pending: Boolean(jobId && !mediaUrl) || pendingStatuses.has(status),
    job_id: jobId,
    media_url: mediaUrl,
    provider_status: status || null,
  };
}

function pricingEvidence(pricing = {}) {
  const normalized = {
    ...pricing,
    unit: pricing.unit || "request",
  };
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
      normalized[field] === null ||
      normalized[field] === undefined ||
      normalized[field] === ""
    ) {
      throw new Error(`PRICING_EVIDENCE_${field.toUpperCase()}_REQUIRED`);
    }
  }

  const supplierCost = Number(normalized.supplier_cost);
  const platformMarkup = Number(normalized.platform_markup);
  const customerPrice = Number(normalized.customer_price);
  if (
    !Number.isFinite(supplierCost) ||
    !Number.isFinite(platformMarkup) ||
    !Number.isFinite(customerPrice) ||
    supplierCost < 0 ||
    platformMarkup < 0 ||
    customerPrice < 0
  ) {
    throw new Error("VALID_PRICING_EVIDENCE_REQUIRED");
  }

  return {
    pricing_id: normalized.pricing_id,
    provider: normalized.provider || null,
    capability: normalized.capability || null,
    model: normalized.model || null,
    supplier_cost: supplierCost,
    platform_markup: platformMarkup,
    customer_price: customerPrice,
    currency: String(normalized.currency).trim().toUpperCase(),
    unit: String(normalized.unit).trim(),
  };
}

function safeError(error) {
  return {
    code: String(error?.code || error?.name || "PROVIDER_OUTCOME_UNKNOWN").slice(0, 120),
    message: String(error?.message || error || "Provider outcome unknown").slice(0, 500),
  };
}

function providerFailure(result = {}) {
  if (result?.success !== false) return null;
  const error = new Error(
    String(
      result.error ||
      result.message ||
      result.output?.error ||
      "PROVIDER_EXECUTION_FAILED",
    ).slice(0, 500),
  );
  error.code = "PROVIDER_EXECUTION_FAILED";
  error.provider_result = {
    provider: result.provider || result.platform || null,
    status: result.status || result.output?.status || null,
  };
  return error;
}

export async function executeService(input = {}) {
  const {
    organization_id,
    party_id = null,
    entity_id = null,
    service_id,
    provider_id = null,
    input: payload = {},
    metadata = {},
    category = "SERVICE",
    provider_policy = {},
    outcome_unknown_policy = null,
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

  const serviceCapabilities = resolveServiceCapabilities(service_id);
  if (!serviceCapabilities?.capabilities?.length) {
    throw new Error(`No enabled capability mapping found for ${service_id}`);
  }

  const executionCapability = resolvePrimaryExecutionCapability(
    serviceCapabilities.capabilities,
  );
  if (!executionCapability) {
    throw new Error(`No execution capability found for ${service_id}`);
  }

  const country = payload.country ?? input.country ?? null;
  const currency = payload.currency ?? input.currency ?? null;
  const selectedProvider = await resolveProvider({
    organization_id,
    capability: executionCapability,
    preferredProvider: provider_id,
    country,
    currency,
    policy: {
      ...(organizationService.provider_policy || {}),
      ...(provider_policy || {}),
    },
  });
  const provider = selectedProvider.provider;
  const model = selectedProvider.model;
  const pricing = await PricingRuntime.resolve({
    provider,
    model,
    capability: executionCapability,
    country,
    currency,
  });
  const pricingSnapshot = pricingEvidence(pricing);
  const quantity = Number(payload.quantity ?? input.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("VALID_SERVICE_QUANTITY_REQUIRED");
  }
  const unit = pricingSnapshot.unit;
  const providerContext = {
    organization_id,
    party_id,
    entity_id,
    credential_id: selectedProvider.credential_id || null,
    organization_service_id: organizationService.id,
    country,
    currency: pricingSnapshot.currency,
  };

  await validateProviderExecution({
    provider,
    capability: executionCapability,
    model,
    input: payload,
    context: providerContext,
  });

  const usage = await UsageRuntime.start({
    organization_id,
    bill_to_organization_id:
      input.bill_to_organization_id || organization_id,
    party_id,
    entity_id,
    organization_service_id: organizationService.id,
    pricing_id: pricingSnapshot.pricing_id,
    category,
    provider,
    capability: executionCapability,
    operation: executionCapability,
    currency: pricingSnapshot.currency,
    quantity,
    unit,
    metadata: {
      ...metadata,
      model,
      pricing_snapshot: pricingSnapshot,
      provider_selection: selectedProvider.selection_evidence || null,
    },
  });

  if (pricingSnapshot.customer_price > 0) {
    await WalletRuntime.reserve({
      organization_id,
      amount: pricingSnapshot.customer_price,
      currency: pricingSnapshot.currency,
      provider,
      reference: usage.id,
      metadata: {
        usage_id: usage.id,
        pricing_id: pricingSnapshot.pricing_id,
      },
    });
  }

  const startedAt = Date.now();
  const keepReservedOnUnknown =
    outcome_unknown_policy === "KEEP_RESERVED" ||
    category === "CREATIVE_PUBLISH";
  let providerReturned = false;

  try {
    const result = await executeProvider({
      provider,
      capability: executionCapability,
      model,
      input: payload,
      context: {
        ...providerContext,
        usage_id: usage.id,
      },
    });
    providerReturned = true;

    const explicitFailure = providerFailure(result);
    if (explicitFailure) throw explicitFailure;

    const state = executionState(result);

    if (state.pending) {
      return {
        success: true,
        pending: true,
        provider,
        model,
        pricing: pricingSnapshot,
        usage,
        settlement: "RESERVED",
        provider_job_id: state.job_id,
        provider_status: state.provider_status,
        output: result,
      };
    }

    const completedUsage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: pricingSnapshot.supplier_cost,
      platform_markup: pricingSnapshot.platform_markup,
      customer_price: pricingSnapshot.customer_price,
      quantity,
      unit,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        model,
        pricing_snapshot: pricingSnapshot,
        result,
      },
    });

    if (pricingSnapshot.customer_price > 0) {
      await WalletRuntime.charge({
        organization_id,
        amount: pricingSnapshot.customer_price,
        currency: pricingSnapshot.currency,
        provider,
        usage_id: completedUsage.id,
        reference: completedUsage.id,
        metadata: {
          pricing_id: pricingSnapshot.pricing_id,
        },
      });
    }

    const billing = await BillingRuntime.billUsage({
      usage_id: completedUsage.id,
    });

    return {
      success: true,
      pending: false,
      provider,
      model,
      pricing: pricingSnapshot,
      usage: billing.usage,
      billing,
      settlement: "CHARGED",
      output: result,
    };
  } catch (error) {
    if (keepReservedOnUnknown && !providerReturned) {
      return {
        success: false,
        pending: false,
        outcome_unknown: true,
        reconciliation_required: true,
        provider,
        model,
        pricing: pricingSnapshot,
        usage,
        settlement: "RESERVED",
        provider_job_id: null,
        provider_status: "outcome_unknown",
        error: safeError(error),
        output: null,
      };
    }

    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        model,
        pricing_snapshot: pricingSnapshot,
        provider_failure: error?.provider_result || null,
      },
    }).catch(() => null);

    if (pricingSnapshot.customer_price > 0) {
      await WalletRuntime.release({
        organization_id,
        amount: pricingSnapshot.customer_price,
        currency: pricingSnapshot.currency,
        provider,
        reference: usage.id,
        metadata: {
          pricing_id: pricingSnapshot.pricing_id,
        },
      });
    }

    throw error;
  }
}

export const ServiceExecutionRuntime = {
  execute: executeService,
};