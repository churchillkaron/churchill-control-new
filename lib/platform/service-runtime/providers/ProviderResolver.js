import {
  getProvidersForCapability,
} from "./ProviderRegistry.js";

import {
  listProviderPricing,
} from "../pricing/repositories/ProviderPricingRepository.js";

import {
  selectBestProvider,
} from "./ProviderIntelligenceResolver.js";

const MANAGED_CAPABILITY_PROVIDERS = {
  "ai.voice.generate": [
    {
      id: "fal",
      name: "fal",
      runtime: "fal",
      runtimeAvailable: true,
      active: true,
      capabilities: ["ai.voice.generate"],
      countries: ["*"],
      currencies: ["*"],
      quality_score: 86,
      speed_score: 88,
      cost_score: 90,
    },
  ],
  "ai.music.generate": [
    {
      id: "fal",
      name: "fal",
      runtime: "fal",
      runtimeAvailable: true,
      active: true,
      capabilities: ["ai.music.generate"],
      countries: ["*"],
      currencies: ["*"],
      quality_score: 84,
      speed_score: 86,
      cost_score: 92,
    },
  ],
  "ai.sfx.generate": [
    {
      id: "fal",
      name: "fal",
      runtime: "fal",
      runtimeAvailable: true,
      active: true,
      capabilities: ["ai.sfx.generate"],
      countries: ["*"],
      currencies: ["*"],
      quality_score: 86,
      speed_score: 90,
      cost_score: 92,
    },
  ],
};

function uniqueProviders(providers = []) {
  const map = new Map();

  for (const provider of providers) {
    if (!provider?.id) continue;
    map.set(provider.id, provider);
  }

  return [...map.values()];
}

export async function resolveProviders({
  capability,
}) {
  if (!capability) {
    throw new Error("capability required");
  }

  return uniqueProviders([
    ...getProvidersForCapability(capability),
    ...(MANAGED_CAPABILITY_PROVIDERS[capability] || []),
  ]).filter(
    (provider) =>
      provider.active !== false &&
      provider.runtimeAvailable !== false,
  );
}

export async function resolveProvider({
  organization_id,
  capability,
  preferredProvider = null,
  country = null,
  currency = null,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const providers = await resolveProviders({ capability });
  const allowedProviders = preferredProvider
    ? providers.filter(
        (provider) => provider.id === preferredProvider,
      )
    : providers;
  const candidates = [];

  for (const provider of allowedProviders) {
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
        cost_per_unit: price.cost_per_unit || 0,
        input_cost: price.input_cost_per_1m || 0,
        output_cost: price.output_cost_per_1m || 0,
        quality_score: provider.quality_score || 80,
        speed_score: provider.speed_score || 80,
        cost_score: provider.cost_score || 80,
        credential_id: price.credential_id || null,
        metadata: {
          provider_name: provider.name,
          managed_runtime: provider.runtime === "fal",
        },
      });
    }
  }

  if (!candidates.length) {
    throw new Error(
      `No available provider for ${capability}`,
    );
  }

  const selected = selectBestProvider(candidates);

  if (!selected) {
    throw new Error(
      `Provider selection failed for ${capability}`,
    );
  }

  return selected;
}

export const ProviderResolver = {
  resolveProviders,
  resolveProvider,
};
