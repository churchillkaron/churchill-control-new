import {
  availableProductionCapabilities,
} from "@/lib/creative/director/planner/creativeProductionCapabilities";
import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  creativeVideoCapabilityProfile,
} from "./CreativeVideoQualityPreferenceRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function score(candidate = {}) {
  return Number(candidate.quality_score || 0) * 10000 +
    Number(candidate.reliability_score || 0) * 100 +
    Number(candidate.speed_score || 0);
}

export async function resolveCreativeVideoProviderConfiguration({
  organization_id,
  currency = null,
  preferred_provider = null,
} = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const { capabilities } = await availableProductionCapabilities(organization_id);
  const candidates = [];

  for (const service of list(capabilities)) {
    for (const capabilityEntry of list(service.capabilities)) {
      const capability = text(
        capabilityEntry?.capability_id ||
        capabilityEntry?.id ||
        capabilityEntry,
      );
      if (!capability) continue;

      try {
        const selected = await resolveProvider({
          organization_id,
          capability,
          preferredProvider: preferred_provider,
          currency,
          policy: {},
        });
        const profile = creativeVideoCapabilityProfile(
          object(selected.metadata).video_capabilities || {},
        );
        if (!profile.resolution_options.length) continue;

        candidates.push({
          organization_service_id: service.organization_service_id || null,
          service_id: service.service_id,
          capability,
          provider: selected.provider,
          model: selected.model || null,
          pricing_id: selected.pricing_id || null,
          currency: selected.currency || currency || null,
          quality_score: selected.quality_score ?? null,
          reliability_score: selected.reliability_score ?? null,
          speed_score: selected.speed_score ?? null,
          provider_metadata: selected.metadata || {},
          video_capabilities: profile,
        });
      } catch {
        // Non-executable or unpriced capabilities are not eligible video configurations.
      }
    }
  }

  candidates.sort((left, right) => score(right) - score(left));
  const selected = candidates[0] || null;
  if (!selected) {
    throw new Error("CREATIVE_VIDEO_PROVIDER_CONFIGURATION_REQUIRED");
  }
  return selected;
}

export const CreativeVideoProviderConfigurationRuntime = Object.freeze({
  resolve: resolveCreativeVideoProviderConfiguration,
});
