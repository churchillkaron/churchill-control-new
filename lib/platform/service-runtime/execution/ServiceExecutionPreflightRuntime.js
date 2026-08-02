import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";
import {
  resolveProvider,
} from "../providers/ProviderResolver";
import {
  assertProviderReady,
} from "../providers/ProviderExecutor";
import {
  PricingRuntime,
} from "../pricing/PricingRuntime";
import {
  resolveServiceCapabilities,
} from "../services/resolver/ServiceCapabilityResolver";
import {
  resolvePrimaryExecutionCapability,
} from "../services/resolver/CapabilityExecutionResolver";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function positive(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function organizationServiceStatus(service = {}) {
  return text(service.status).toUpperCase();
}

function activeOrganizationService(service = {}) {
  const status = organizationServiceStatus(service);
  return !status || ["ACTIVE", "CONNECTED", "HEALTHY", "ENABLED"].includes(status);
}

function pausedOrganizationService(service = {}) {
  return organizationServiceStatus(service) === "PAUSED";
}

function providerReadinessInput({
  payload,
  serviceId,
  capability,
  pricing,
  selectedProvider,
}) {
  return {
    ...object(payload),
    service_id: serviceId,
    capability,
    model: selectedProvider.model || pricing.model || null,
    pricing_resolution: {
      mode: "ACTIVE_PROVIDER_PRICING",
      pricing_id: pricing.pricing_id,
      provider: selectedProvider.provider,
      model: selectedProvider.model || pricing.model || null,
      credential_id: selectedProvider.credential_id || null,
      supplier_cost: pricing.supplier_cost,
      platform_markup: pricing.platform_markup,
      customer_price: pricing.customer_price,
      currency: pricing.currency,
      unit: pricing.unit || null,
      estimated: pricing.estimated === true,
    },
  };
}

export async function preflightServiceExecution(input = {}) {
  const {
    organization_id,
    service_id,
    provider_id = null,
    input: payload = {},
    provider_policy = {},
    allow_paused_reactivation_check = false,
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

  const active = activeOrganizationService(organizationService);
  const pausedReactivationCheck =
    allow_paused_reactivation_check === true &&
    pausedOrganizationService(organizationService);

  if (!active && !pausedReactivationCheck) {
    throw new Error(
      `Service ${service_id} is not active for organization:${organizationService.status}`,
    );
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
  const quantity = positive(payload.quantity ?? input.quantity, 1);
  const selectedProvider = await resolveProvider({
    organization_id,
    capability: executionCapability,
    preferredProvider: provider_id,
    country,
    currency,
    policy: object(provider_policy),
  });

  if (!selectedProvider?.provider) {
    throw new Error(`Service provider resolution failed for ${service_id}`);
  }
  if (!selectedProvider?.pricing_id) {
    throw new Error(
      `Service pricing resolution failed for ${service_id}:${selectedProvider.provider}`,
    );
  }

  const pricing = await PricingRuntime.resolveById({
    pricing_id: selectedProvider.pricing_id,
    currency: selectedProvider.currency || currency || null,
    usage: { quantity },
  });

  const readiness = await assertProviderReady({
    provider: selectedProvider.provider,
    capability: executionCapability,
    model: selectedProvider.model || pricing.model || null,
    input: providerReadinessInput({
      payload,
      serviceId: service_id,
      capability: executionCapability,
      pricing,
      selectedProvider,
    }),
    context: {
      organization_id,
      credential_id: selectedProvider.credential_id || null,
      organization_service_id: organizationService.id,
      country,
      currency: pricing.currency,
      preflight_only: true,
    },
  });

  if (readiness?.ready === false) {
    throw new Error(
      `Service provider not ready:${service_id}:${selectedProvider.provider}`,
    );
  }

  return {
    contract: "SERVICE_EXECUTION_PREFLIGHT_V1",
    ready: true,
    organization_id,
    organization_service_id: organizationService.id,
    organization_service_status: organizationService.status || null,
    paused_reactivation_check: pausedReactivationCheck,
    service_id,
    capability: executionCapability,
    provider: selectedProvider.provider,
    model: selectedProvider.model || pricing.model || null,
    credential_id: selectedProvider.credential_id || null,
    credential_resolved: readiness?.credential_resolved === true,
    provider_ready: readiness?.ready !== false,
    pricing,
    quantity,
    unit: pricing.unit || "request",
    country,
    currency: pricing.currency,
    provider_selection: selectedProvider.selection_evidence || null,
    provider_policy: object(provider_policy),
    wallet_reservation_performed: false,
    usage_started: false,
    billing_created: false,
    provider_execution_performed: false,
  };
}

export const ServiceExecutionPreflightRuntime = {
  preflight: preflightServiceExecution,
};
