import "./fal/FalProviderRegistration.js";
import "./gemini/GeminiProviderRegistration.js";
import "./google/GoogleProviderRegistration.js";

import {
  getProvider,
  getProvidersForCapability,
} from "./ProviderRegistry.js";

import {
  listCapabilityPricing,
} from "../pricing/repositories/ProviderPricingRepository.js";

import {
  selectBestProvider,
} from "./ProviderIntelligenceResolver.js";

function providerAllowed(provider = {}, policy = {}) {
  const allowed = Array.isArray(policy.allowed_providers)
    ? policy.allowed_providers
    : Array.isArray(policy.allowedProviders)
      ? policy.allowedProviders
      : [];
  const blocked = Array.isArray(policy.blocked_providers)
    ? policy.blocked_providers
    : Array.isArray(policy.blockedProviders)
      ? policy.blockedProviders
      : [];

  if (blocked.includes(provider.id)) return false;
  if (allowed.length && !allowed.includes(provider.id)) return false;
  return true;
}

function executableRegistryProvider(providerId) {
  const provider = getProvider(providerId);
  return provider &&
    provider.active !== false &&
    provider.runtimeAvailable !== false &&
    provider.runtime
    ? provider
    : null;
}

function providerDescriptor(providerId, registryProvider) {
  return {
    id: providerId,
    name: registryProvider.name || providerId,
    runtime: registryProvider.runtime,
    runtimeAvailable: registryProvider.runtimeAvailable !== false,
    active: registryProvider.active !== false,
    quality_score: registryProvider.quality_score ?? null,
    speed_score: registryProvider.speed_score ?? null,
    reliability_score: registryProvider.reliability_score ?? null,
    credential_id: registryProvider.credential_id ?? null,
    metadata: registryProvider.metadata || {},
  };
}

export async function resolveProviders({
  capability,
  country = null,
  currency = null,
}) {
  if (!capability) throw new Error("capability required");

  const registryProviders = getProvidersForCapability(capability);
  const pricing = await listCapabilityPricing({ capability, country, currency });
  const byId = new Map();

  for (const provider of registryProviders) {
    const executable = executableRegistryProvider(provider.id);
    if (!executable) continue;
    byId.set(provider.id, providerDescriptor(provider.id, executable));
  }

  for (const row of pricing) {
    const providerId = row.provider;
    if (!providerId) continue;
    const registryProvider = executableRegistryProvider(providerId);
    if (!registryProvider) continue;
    byId.set(providerId, providerDescriptor(providerId, registryProvider));
  }

  const executableProviderIds = new Set(byId.keys());
  const executablePricing = pricing.filter((row) =>
    row.provider && executableProviderIds.has(row.provider),
  );

  return {
    providers: [...byId.values()],
    pricing: executablePricing,
    rejected_pricing: pricing
      .filter((row) => row.provider && !executableProviderIds.has(row.provider))
      .map((row) => ({
        pricing_id: row.id || null,
        provider: row.provider,
        capability,
        reason: getProvider(row.provider)
          ? "PROVIDER_RUNTIME_UNAVAILABLE"
          : "PROVIDER_NOT_REGISTERED",
      })),
  };
}

export async function resolveProvider({
  organization_id,
  capability,
  preferredProvider = null,
  country = null,
  currency = null,
  policy = {},
}) {
  if (!organization_id) throw new Error("organization_id required");

  const resolved = await resolveProviders({ capability, country, currency });
  const providers = resolved.providers.filter((provider) => providerAllowed(provider, policy));
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const candidates = [];

  for (const price of resolved.pricing) {
    const provider = providerMap.get(price.provider);
    if (!provider) continue;

    candidates.push({
      provider: provider.id,
      model: price.model || null,
      capability,
      currency: price.currency || currency,
      pricing_id: price.id || null,
      supplier_cost: price.supplier_cost ?? price.cost_per_unit ?? null,
      customer_price: price.customer_price ?? null,
      cost_per_unit: price.cost_per_unit ?? null,
      input_cost: price.input_cost_per_1m ?? null,
      output_cost: price.output_cost_per_1m ?? null,
      quality_score: price.quality_score ?? provider.quality_score ?? null,
      speed_score: price.speed_score ?? provider.speed_score ?? null,
      reliability_score: price.reliability_score ?? provider.reliability_score ?? null,
      credential_id: price.credential_id ?? provider.credential_id ?? null,
      metadata: {
        ...(provider.metadata || {}),
        ...(price.metadata || {}),
        provider_name: provider.name,
        preferred: provider.id === preferredProvider,
      },
    });
  }

  if (!candidates.length) {
    const rejected = resolved.rejected_pricing
      .map((item) => `${item.provider}:${item.reason}`)
      .join(",");
    throw new Error(
      `No priced executable provider available for ${capability}${rejected ? `; rejected=${rejected}` : ""}`,
    );
  }

  const selected = selectBestProvider(candidates, {
    ...policy,
    preferred_providers: preferredProvider
      ? [preferredProvider, ...(policy.preferred_providers || [])]
      : policy.preferred_providers,
  });

  if (!selected) throw new Error(`Provider selection failed for ${capability}`);
  return selected;
}

export const ProviderResolver = {
  resolveProviders,
  resolveProvider,
};
