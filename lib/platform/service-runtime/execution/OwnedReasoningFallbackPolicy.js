const OWNED_PROVIDER = "avantiqo-intelligence";
const REASONING_CAPABILITY = "ai.reasoning.execute";

function text(value) {
  return String(value ?? "").trim();
}

function blockedProviders(policy = {}) {
  const values = Array.isArray(policy.blocked_providers)
    ? policy.blocked_providers
    : Array.isArray(policy.blockedProviders)
      ? policy.blockedProviders
      : [];
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

export function ownedReasoningFallbackDecision({
  error,
  capability,
  providerPolicy = {},
} = {}) {
  const failedProvider = text(error?.__provider_id);
  const failedCapability = text(error?.__provider_capability || capability);
  const alreadyBlocked = blockedProviders(providerPolicy);

  if (failedProvider !== OWNED_PROVIDER) {
    return { allowed: false, reason: "FAILED_PROVIDER_NOT_OWNED_REASONING" };
  }
  if (failedCapability !== REASONING_CAPABILITY || text(capability) !== REASONING_CAPABILITY) {
    return { allowed: false, reason: "CAPABILITY_NOT_OWNED_REASONING" };
  }
  if (alreadyBlocked.includes(OWNED_PROVIDER)) {
    return { allowed: false, reason: "OWNED_PROVIDER_ALREADY_EXCLUDED" };
  }

  return {
    allowed: true,
    reason: "OWNED_REASONING_PROVIDER_FAILED",
    provider_policy: {
      ...providerPolicy,
      blocked_providers: [...alreadyBlocked, OWNED_PROVIDER],
    },
    failed_provider: OWNED_PROVIDER,
    failed_capability: REASONING_CAPABILITY,
  };
}

export const OWNED_REASONING_PROVIDER_ID = OWNED_PROVIDER;
export const OWNED_REASONING_CAPABILITY = REASONING_CAPABILITY;
