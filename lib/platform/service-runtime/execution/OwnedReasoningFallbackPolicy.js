const OWNED_PROVIDER = "avantiqo-intelligence";
const REASONING_CAPABILITY = "ai.reasoning.execute";
const FALLBACK_KIND = "owned_reasoning_provider_failover";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function blockedProviders(policy = {}) {
  const values = Array.isArray(policy.blocked_providers)
    ? policy.blocked_providers
    : Array.isArray(policy.blockedProviders)
      ? policy.blockedProviders
      : [];
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function allowedProviders(policy = {}) {
  const values = Array.isArray(policy.allowed_providers)
    ? policy.allowed_providers
    : Array.isArray(policy.allowedProviders)
      ? policy.allowedProviders
      : [];
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function fallbackDisabled(policy = {}) {
  return (
    policy.allow_owned_reasoning_fallback === false ||
    policy.allowOwnedReasoningFallback === false ||
    policy.owned_reasoning_fallback === false ||
    policy.ownedReasoningFallback === false
  );
}

function priorFallbackAttempt(metadata = {}) {
  const failover = object(metadata.provider_failover || metadata.providerFailover);
  return Number(failover.attempt || 0);
}

export function ownedReasoningFallbackDecision({
  error,
  provider = null,
  capability,
  providerPolicy = {},
  metadata = {},
} = {}) {
  const failedProvider = text(error?.__provider_id || provider);
  const failedCapability = text(error?.__provider_capability || capability);
  const alreadyBlocked = blockedProviders(providerPolicy);
  const explicitlyAllowed = allowedProviders(providerPolicy);

  if (fallbackDisabled(providerPolicy)) {
    return { allowed: false, reason: "OWNED_REASONING_FALLBACK_DISABLED" };
  }
  if (priorFallbackAttempt(metadata) >= 2) {
    return { allowed: false, reason: "FALLBACK_ATTEMPT_ALREADY_CONSUMED" };
  }
  if (failedProvider !== OWNED_PROVIDER) {
    return { allowed: false, reason: "FAILED_PROVIDER_NOT_OWNED_REASONING" };
  }
  if (
    failedCapability !== REASONING_CAPABILITY ||
    text(capability) !== REASONING_CAPABILITY
  ) {
    return { allowed: false, reason: "CAPABILITY_NOT_OWNED_REASONING" };
  }
  if (alreadyBlocked.includes(OWNED_PROVIDER)) {
    return { allowed: false, reason: "OWNED_PROVIDER_ALREADY_EXCLUDED" };
  }
  if (
    explicitlyAllowed.length > 0 &&
    !explicitlyAllowed.some((providerId) => providerId !== OWNED_PROVIDER)
  ) {
    return { allowed: false, reason: "NO_ALLOWED_FALLBACK_PROVIDER" };
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

export function buildOwnedReasoningFallbackInput({
  input = {},
  decision,
  failedUsageId,
  failedProvider,
  failedModel = null,
} = {}) {
  if (decision?.allowed !== true) {
    throw new Error("OWNED_REASONING_FALLBACK_NOT_ALLOWED");
  }

  const metadata = object(input.metadata);
  const priorFailover = object(
    metadata.provider_failover || metadata.providerFailover,
  );
  const chainId = text(priorFailover.chain_id || failedUsageId);
  if (!chainId || !text(failedUsageId) || !text(failedProvider)) {
    throw new Error("OWNED_REASONING_FALLBACK_EVIDENCE_REQUIRED");
  }

  return {
    ...input,
    provider_id: null,
    provider_policy: decision.provider_policy,
    metadata: {
      ...metadata,
      provider_failover: {
        kind: FALLBACK_KIND,
        attempt: 2,
        chain_id: chainId,
        previous_usage_id: text(failedUsageId),
        previous_provider: text(failedProvider),
        previous_model: text(failedModel) || null,
        reason: text(decision.reason),
        owned_provider_excluded: true,
      },
    },
  };
}

export function ownedReasoningFallbackEvidence({
  failedUsageId,
  failedProvider,
  failedModel = null,
  decision,
  result = {},
} = {}) {
  return {
    occurred: true,
    kind: FALLBACK_KIND,
    reason: text(decision?.reason),
    from: {
      provider: text(failedProvider) || null,
      model: text(failedModel) || null,
      usage_id: text(failedUsageId) || null,
      status: "FAILED",
    },
    to: {
      provider: text(result?.provider) || null,
      model: text(result?.model) || null,
      usage_id: text(result?.usage?.id) || null,
      status: result?.pending === true ? "PENDING" : "SUCCESS",
    },
  };
}

export const OWNED_REASONING_PROVIDER_ID = OWNED_PROVIDER;
export const OWNED_REASONING_CAPABILITY = REASONING_CAPABILITY;
export const OWNED_REASONING_FALLBACK_KIND = FALLBACK_KIND;
