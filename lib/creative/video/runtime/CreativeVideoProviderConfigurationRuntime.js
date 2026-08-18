import {
  availableProductionCapabilities,
} from "@/lib/creative/director/planner/creativeProductionCapabilities";
import {
  resolveProviders,
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

function selectionPriority(candidate = {}) {
  const priority = Number(candidate.video_capabilities?.selection_priority);
  return Number.isFinite(priority) ? priority : 0;
}

function stableCandidateOrder(left = {}, right = {}) {
  const priorityDifference =
    selectionPriority(right) - selectionPriority(left);
  if (priorityDifference) return priorityDifference;

  return [left.provider, left.model, left.pricing_id]
    .map(text)
    .join(":")
    .localeCompare(
      [right.provider, right.model, right.pricing_id]
        .map(text)
        .join(":"),
    );
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

      let resolved;
      try {
        resolved = await resolveProviders({
          capability,
          currency,
        });
      } catch {
        continue;
      }

      const providers = new Map(
        list(resolved.providers).map((provider) => [text(provider.id), provider]),
      );

      for (const pricing of list(resolved.pricing)) {
        const providerId = text(pricing.provider);
        const provider = providers.get(providerId);
        if (!provider || !providerId) continue;

        const metadata = {
          ...object(provider.metadata),
          ...object(pricing.metadata),
        };
        const profile = creativeVideoCapabilityProfile(
          object(metadata.video_capabilities),
        );
        if (!profile.resolution_options.length) continue;

        candidates.push({
          organization_service_id: service.organization_service_id || null,
          service_id: service.service_id,
          capability,
          provider: providerId,
          model: pricing.model || null,
          pricing_id: pricing.id || null,
          currency: pricing.currency || currency || null,
          provider_metadata: metadata,
          video_capabilities: profile,
        });
      }
    }
  }

  const preferred = text(preferred_provider);
  const preferredCandidates = preferred
    ? candidates.filter((candidate) => candidate.provider === preferred)
    : [];
  const eligible = preferredCandidates.length ? preferredCandidates : candidates;

  eligible.sort(stableCandidateOrder);
  const selected = eligible[0] || null;
  if (!selected) {
    throw new Error("CREATIVE_VIDEO_PROVIDER_CONFIGURATION_REQUIRED");
  }
  return selected;
}

export const CreativeVideoProviderConfigurationRuntime = Object.freeze({
  resolve: resolveCreativeVideoProviderConfiguration,
});
