import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";
import {
  resolveProvider,
} from "../providers/ProviderResolver";
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameMoney(left, right) {
  const a = finite(left);
  const b = finite(right);
  return a !== null && b !== null && Math.abs(a - b) <= 0.000001;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function sameObject(left, right) {
  return JSON.stringify(canonical(object(left))) ===
    JSON.stringify(canonical(object(right)));
}

function approvedExecutionPreflight(input = {}) {
  return object(
    input.approved_execution_preflight ||
    input.metadata?.approved_execution_preflight,
  );
}

function requestedQuantity(input = {}, payload = {}) {
  const quantity = finite(payload.quantity ?? input.quantity);
  if (quantity !== null && quantity <= 0) {
    throw new Error("SERVICE_EXECUTION_QUANTITY_INVALID");
  }
  return quantity;
}

function pricingUsage(input = {}, payload = {}, approved = {}) {
  const explicit = object(input.pricing_usage);
  const approvedDimensions = object(approved.pricing_dimensions);
  const payloadDimensions = object(payload.pricing_dimensions);
  const requested = requestedQuantity(input, payload);
  const approvedQuantity = finite(approved.quantity);

  if (
    approvedQuantity !== null &&
    requested !== null &&
    requested !== approvedQuantity
  ) {
    throw new Error(
      `SERVICE_EXECUTION_APPROVED_QUANTITY_MISMATCH:${requested}:${approvedQuantity}`,
    );
  }

  if (
    Object.keys(approvedDimensions).length &&
    Object.keys(payloadDimensions).length &&
    !sameObject(approvedDimensions, payloadDimensions)
  ) {
    throw new Error("SERVICE_EXECUTION_APPROVED_PRICING_DIMENSIONS_MISMATCH");
  }

  const quantity = approvedQuantity ?? requested;
  const dimensions = Object.keys(approvedDimensions).length
    ? approvedDimensions
    : payloadDimensions;

  return {
    ...explicit,
    ...(quantity !== null ? { quantity } : {}),
    pricing_dimensions: {
      ...object(explicit.pricing_dimensions),
      ...dimensions,
    },
  };
}

function assertApprovedIdentity({
  approved,
  organizationService,
  serviceId,
  capability,
  selectedProvider,
}) {
  if (!Object.keys(approved).length) return;

  const checks = [
    ["organization_service_id", organizationService.id],
    ["service_id", serviceId],
    ["capability", capability],
    ["provider", selectedProvider.provider],
    ["model", selectedProvider.model],
    ["pricing_id", selectedProvider.pricing_id],
  ];

  for (const [field, actual] of checks) {
    const expected = text(approved[field]);
    if (expected && expected !== text(actual)) {
      throw new Error(
        `SERVICE_EXECUTION_APPROVED_PREFLIGHT_MISMATCH:${field}:${text(actual) || "missing"}:${expected}`,
      );
    }
  }
}

function assertApprovedPricing(approved = {}, pricing = {}) {
  if (!Object.keys(approved).length) return;

  const expectedPrice = finite(approved.customer_price);
  if (
    expectedPrice !== null &&
    !sameMoney(pricing.customer_price, expectedPrice)
  ) {
    throw new Error(
      `SERVICE_EXECUTION_APPROVED_PRICE_MISMATCH:${pricing.customer_price}:${expectedPrice}`,
    );
  }

  const expectedQuantity = finite(approved.quantity);
  if (
    expectedQuantity !== null &&
    finite(pricing.priced_quantity) !== expectedQuantity
  ) {
    throw new Error(
      `SERVICE_EXECUTION_APPROVED_PRICED_QUANTITY_MISMATCH:${pricing.priced_quantity}:${expectedQuantity}`,
    );
  }

  const expectedCurrency = text(approved.currency).toUpperCase();
  if (
    expectedCurrency &&
    text(pricing.currency).toUpperCase() !== expectedCurrency
  ) {
    throw new Error("SERVICE_EXECUTION_APPROVED_CURRENCY_MISMATCH");
  }

  const expectedUnit = text(approved.unit);
  if (expectedUnit && text(pricing.unit) !== expectedUnit) {
    throw new Error("SERVICE_EXECUTION_APPROVED_UNIT_MISMATCH");
  }

  const expectedDimensions = object(approved.pricing_dimensions);
  if (
    Object.keys(expectedDimensions).length &&
    !sameObject(expectedDimensions, pricing.pricing_dimensions)
  ) {
    throw new Error("SERVICE_EXECUTION_APPROVED_PRICING_RESULT_DIMENSIONS_MISMATCH");
  }
}

export async function resolveServiceExecutionPreflight(input = {}) {
  const {
    organization_id,
    service_id,
    provider_id = null,
    input: payload = {},
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
  if (text(organizationService.status).toUpperCase() !== "ACTIVE") {
    throw new Error(`Service ${service_id} is not active for organization`);
  }
  if (organizationService.usage_enabled === false) {
    throw new Error(`Service ${service_id} usage is disabled for organization`);
  }

  const serviceCapabilities = resolveServiceCapabilities(service_id);
  if (!serviceCapabilities?.capabilities?.length) {
    throw new Error(`No enabled capability mapping found for ${service_id}`);
  }

  const requestedCapability = text(input.capability || payload.capability);
  const resolvedCapabilities = serviceCapabilities.capabilities || [];
  const executionCapability = requestedCapability ||
    resolvePrimaryExecutionCapability(resolvedCapabilities);

  if (!executionCapability) {
    throw new Error(`No execution capability found for ${service_id}`);
  }
  if (
    requestedCapability &&
    !resolvedCapabilities.includes(requestedCapability)
  ) {
    throw new Error(
      `Capability ${requestedCapability} is not enabled for service ${service_id}`,
    );
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

  const approved = approvedExecutionPreflight(input);
  assertApprovedIdentity({
    approved,
    organizationService,
    serviceId: service_id,
    capability: executionCapability,
    selectedProvider,
  });

  const usage = pricingUsage(input, payload, approved);
  const pricing = PricingRuntime.resolveRecord({
    pricing: selectedProvider.pricing_record,
    provider: selectedProvider.provider,
    model: selectedProvider.model,
    capability: executionCapability,
    currency,
    usage,
  });

  if (!text(pricing.unit)) {
    throw new Error(`SERVICE_EXECUTION_PRICING_UNIT_REQUIRED:${pricing.pricing_id}`);
  }
  if (finite(pricing.priced_quantity) === null || pricing.priced_quantity <= 0) {
    throw new Error(
      `SERVICE_EXECUTION_PRICED_QUANTITY_REQUIRED:${pricing.pricing_id}`,
    );
  }

  assertApprovedPricing(approved, pricing);

  return {
    contract: "SERVICE_EXECUTION_PREFLIGHT_V1",
    organization_id,
    organization_service_id: organizationService.id,
    service_id,
    capability: executionCapability,
    provider: selectedProvider.provider,
    model: selectedProvider.model || null,
    pricing_id: pricing.pricing_id,
    currency: pricing.currency,
    quantity: pricing.priced_quantity,
    unit: pricing.unit,
    supplier_cost: pricing.supplier_cost,
    platform_markup: pricing.platform_markup,
    customer_price: pricing.customer_price,
    pricing_dimensions: pricing.pricing_dimensions || {},
    pricing_metadata: pricing.pricing_metadata || {},
    pricing,
    pricing_record: selectedProvider.pricing_record,
    credential_id: selectedProvider.credential_id || null,
    provider_selection_evidence: selectedProvider.selection_evidence || null,
    country,
  };
}

export const ServiceExecutionPreflightRuntime = Object.freeze({
  contract: "SERVICE_EXECUTION_PREFLIGHT_V1",
  resolve: resolveServiceExecutionPreflight,
});
