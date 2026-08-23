import "./avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js";
import "./avantiqo-image/AvantiqoImageProviderRegistration.js";
import "./avantiqo-video/AvantiqoVideoProviderRegistration.js";
import "./avantiqo-audio/AvantiqoAudioProviderRegistration.js";
import "./avantiqo-voice/AvantiqoVoiceProviderRegistration.js";
import "./avantiqo-code/AvantiqoCodeProviderRegistration.js";
import "./fal/FalProviderRegistration.js";
import "./gemini/GeminiProviderRegistration.js";
import "./gemini/GoogleVeoProviderRegistration.js";
import "./google/GoogleProviderRegistration.js";
import "./meta/MetaMessagingProviderRegistration.js";

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
import {
  ownedFirstProviderPreferences,
  ownedProviderForCapability,
} from "./AvantiqoOwnedProviderPolicy.js";
import {
  ownedExecutionCertification,
} from "./AvantiqoOwnedCertificationPolicy.js";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolutionHeight(value) {
  const source = text(value).toLowerCase();
  if (!source) return null;
  if (source.includes("4k")) return 2160;
  const match = source.match(/(\d{3,4})/);
  return match ? Number(match[1]) : null;
}

function providerMeetsVideoRequirements(provider = {}, policy = {}) {
  const requirements = policy.video_requirements || policy.videoRequirements || null;
  if (!requirements) return true;

  const capability = text(requirements.capability).toLowerCase();
  if (!capability.startsWith("ai.video.")) return true;

  const video = provider.metadata?.video_capabilities || {};
  if (!video || !Object.keys(video).length) {
    // External providers remain eligible only as capability-registered fallbacks when
    // they do not publish the richer Avantiqo video capability envelope yet.
    return true;
  }

  const duration = finite(requirements.duration_seconds);
  const allowedDurations = Array.isArray(video.allowed_duration_seconds)
    ? video.allowed_duration_seconds.map(finite).filter((value) => value !== null)
    : [];
  if (duration !== null && allowedDurations.length) {
    const minimum = Math.min(...allowedDurations);
    const maximum = Math.max(...allowedDurations);
    if (duration < minimum || duration > maximum) return false;
  }

  const requestedHeight = finite(requirements.resolution_height) ??
    resolutionHeight(requirements.resolution);
  const supportedHeights = Array.isArray(video.supported_resolutions)
    ? video.supported_resolutions
      .map(resolutionHeight)
      .filter((value) => value !== null)
    : [];
  if (requestedHeight !== null && supportedHeights.length) {
    if (requestedHeight > Math.max(...supportedHeights)) return false;
  }

  if (
    requirements.exact_last_frame_required === true &&
    !(video.last_frame === true && video.first_last_frame_interpolation === true)
  ) {
    return false;
  }
  if (
    requirements.video_extension_required === true &&
    video.source_tail_continuation !== true
  ) {
    return false;
  }
  if (
    requirements.multi_reference_control_required === true &&
    Number(video.reference_image_limit || 0) < 2
  ) {
    return false;
  }
  if (
    capability === "ai.video.inpaint" &&
    video.localized_mask_video_editing !== true
  ) {
    return false;
  }
  if (
    capability === "ai.video.upscale" &&
    video.owned_super_resolution !== true
  ) {
    return false;
  }
  if (
    capability === "ai.video.lipsync" &&
    video.owned_audio_conditioned_lipsync !== true
  ) {
    return false;
  }

  return true;
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
  if (!providerMeetsVideoRequirements(provider, policy)) return false;
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

function preferredProviders(capability, explicitProvider, policy = {}) {
  const configured = ownedFirstProviderPreferences(capability, policy);
  if (!explicitProvider) return configured;
  return [
    explicitProvider,
    ...configured.filter((provider) => provider !== explicitProvider),
  ];
}

function pricedExecutionCandidate({ provider, price, capability, currency, ownedProvider }) {
  const certification = ownedExecutionCertification({
    provider,
    capability,
    pricing: price,
  });
  if (!certification.eligible) {
    return {
      candidate: null,
      rejection: {
        pricing_id: price.id || null,
        provider: provider.id,
        capability,
        reason: certification.reason || "OWNED_EXECUTION_NOT_CERTIFIED",
        certification,
      },
    };
  }

  return {
    candidate: {
      provider: provider.id,
      model: price.model || null,
      capability,
      currency: price.currency || currency,
      pricing_id: price.id || null,
      pricing_record: price,
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
        owned_provider: provider.id === ownedProvider,
        owned_first_contract: "AVANTIQO_OWNED_FIRST_PROVIDER_POLICY_V1",
        owned_execution_certification: certification,
      },
    },
    rejection: null,
  };
}

export async function resolveProviders({ capability, country = null, currency = null }) {
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
  const executablePricing = pricing.filter((row) => row.provider && executableProviderIds.has(row.provider));

  return {
    providers: [...byId.values()],
    pricing: executablePricing,
    rejected_pricing: pricing
      .filter((row) => row.provider && !executableProviderIds.has(row.provider))
      .map((row) => ({
        pricing_id: row.id || null,
        provider: row.provider,
        capability,
        reason: getProvider(row.provider) ? "PROVIDER_RUNTIME_UNAVAILABLE" : "PROVIDER_NOT_REGISTERED",
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
  const certificationRejections = [];
  const ownedProvider = ownedProviderForCapability(capability);

  for (const price of resolved.pricing) {
    const provider = providerMap.get(price.provider);
    if (!provider) continue;
    const evaluated = pricedExecutionCandidate({
      provider,
      price,
      capability,
      currency,
      ownedProvider,
    });
    if (evaluated.rejection) {
      certificationRejections.push(evaluated.rejection);
      continue;
    }
    candidates.push(evaluated.candidate);
  }

  if (!candidates.length) {
    const rejected = [
      ...resolved.rejected_pricing,
      ...certificationRejections,
    ].map((item) => `${item.provider}:${item.reason}`).join(",");
    throw new Error(`No priced executable provider available for ${capability}${rejected ? `; rejected=${rejected}` : ""}`);
  }

  const ownedCandidates = ownedProvider
    ? candidates.filter((candidate) => candidate.provider === ownedProvider)
    : [];
  const selectionPool = ownedCandidates.length ? ownedCandidates : candidates;
  const configuredPreferences = preferredProviders(
    capability,
    preferredProvider,
    policy,
  );

  const selected = selectBestProvider(selectionPool, {
    ...policy,
    preferred_providers: configuredPreferences,
  });

  if (!selected) throw new Error(`Provider selection failed for ${capability}`);
  return {
    ...selected,
    metadata: {
      ...(selected.metadata || {}),
      owned_first_selected: selected.provider === ownedProvider,
      external_fallback_selected:
        Boolean(ownedProvider) && selected.provider !== ownedProvider,
      owned_certification_rejections: certificationRejections.map((item) => ({
        pricing_id: item.pricing_id,
        provider: item.provider,
        reason: item.reason,
      })),
    },
  };
}

export const ProviderResolver = { resolveProviders, resolveProvider };
