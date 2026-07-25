import {
  getProvidersForCapability,
} from "./ProviderRegistry.js";

import {
  listProviderPricing,
} from "../pricing/repositories/ProviderPricingRepository.js";

import {
  selectBestProvider,
} from "./ProviderIntelligenceResolver.js";

export async function resolveProviders({ capability }) {
  if (!capability) {
    throw new Error("capability required");
  }

  return getProvidersForCapability(capability);
}

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

export async function resolveProvider({
  organization_id,
  capability,
  preferredProvider = null,
  country = null,
  currency = null,
  policy = {},
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const providers = (await resolveProviders({ capability }))
    .filter((provider) => providerAllowed(provider, policy));
  const preferred = preferredProvider
    ? providers.find((provider) => provider.id === preferredProvider)
    : null;
  const orderedProviders = preferred
    ? [preferred, ...providers.filter((provider) => provider.id !== preferred.id)]
    : providers;
  const candidates = [];

  for (const provider of orderedProviders) {
    const pricing = await listProviderPricing({
      provider: provider.id,
      capability,
      country,
      currency,
    });

    for (const price of pricing) {
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
        quality_score:
          price.quality_score ??
          provider.quality_score ??
          null,
        speed_score:
          price.speed_score ??
          provider.speed_score ??
          null,
        reliability_score:
          price.reliability_score ??
          provider.reliability_score ??
          null,
        credential_id:
          price.credential_id ??
          provider.credential_id ??
          null,
        metadata: {
          ...(provider.metadata || {}),
          ...(price.metadata || {}),
          provider_name: provider.name,
          preferred: provider.id === preferredProvider,
        },
      });
    }
  }

  if (!candidates.length) {
    throw new Error(`No priced provider available for ${capability}`);
  }

  const selected = selectBestProvider(candidates, {
    ...policy,
    preferred_providers: preferredProvider
      ? [preferredProvider, ...(policy.preferred_providers || [])]
      : policy.preferred_providers,
  });

  if (!selected) {
    throw new Error(`Provider selection failed for ${capability}`);
  }

  return selected;
}

export const ProviderResolver = {
  resolveProviders,
  resolveProvider,
};
