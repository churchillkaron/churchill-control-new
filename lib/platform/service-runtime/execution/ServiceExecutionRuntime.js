import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";

import {
  resolveProvider,
} from "../providers/ProviderResolver";

import {
  executeProvider,
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
  const quantity = Number(payload.quantity ?? input.quantity ?? 1);
  const unit = pricing.unit || "request";
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
      model,
      provider_selection: selectedProvider.selection_evidence || null,
    },
  });

  await WalletRuntime.reserve({
    organization_id,
    amount: pricing.customer_price,
    provider,
    reference: usage.id,
  });

  const startedAt = Date.now();

  try {
    const result = await executeProvider({
      provider,
      capability: executionCapability,
      model,
      input: payload,
      context: {
        organization_id,
        party_id,
        entity_id,
        credential_id: selectedProvider.credential_id || null,
        organization_service_id: organizationService.id,
        country,
        currency: pricing.currency,
        usage_id: usage.id,
      },
    });
    const state = executionState(result);

    if (state.pending) {
      return {
        success: true,
        pending: true,
        provider,
        model,
        pricing,
        usage,
        settlement: "RESERVED",
        provider_job_id: state.job_id,
        provider_status: state.provider_status,
        output: result,
      };
    }

    const completedUsage = await UsageRuntime.complete({
      usage_id: usage.id,
      supplier_cost: pricing.supplier_cost,
      platform_markup: pricing.platform_markup,
      customer_price: pricing.customer_price,
      quantity,
      unit,
      latency_ms: Date.now() - startedAt,
      metadata: {
        ...metadata,
        model,
        result,
      },
    });

    await WalletRuntime.charge({
      organization_id,
      amount: pricing.customer_price,
      provider,
      usage_id: completedUsage.id,
      reference: completedUsage.id,
    });

    const billing = await BillingRuntime.billUsage({
      usage_id: completedUsage.id,
    });

    return {
      success: true,
      pending: false,
      provider,
      model,
      pricing,
      usage: billing.usage,
      billing,
      settlement: "CHARGED",
      output: result,
    };
  } catch (error) {
    await UsageRuntime.fail({
      usage_id: usage.id,
      error,
      latency_ms: Date.now() - startedAt,
      metadata,
    }).catch(() => null);

    await WalletRuntime.release({
      organization_id,
      amount: pricing.customer_price,
      provider,
      reference: usage.id,
    });

    throw error;
  }
}

export const ServiceExecutionRuntime = {
  execute: executeService,
};
