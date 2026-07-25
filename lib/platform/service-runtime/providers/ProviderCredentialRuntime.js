const resolvers = new Map();

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function environmentStore() {
  const raw = process.env.AVANTIQO_PROVIDER_CREDENTIALS_JSON;
  if (!raw) return null;

  try {
    return object(JSON.parse(raw));
  } catch {
    throw new Error("AVANTIQO_PROVIDER_CREDENTIALS_JSON_INVALID");
  }
}

function fromBucket(bucket, provider, credentialId) {
  const providerBucket = object(bucket?.[provider]);
  if (!providerBucket) return null;

  if (credentialId && object(providerBucket[credentialId])) {
    return providerBucket[credentialId];
  }

  return object(providerBucket.default) ||
    (providerBucket.access_token || providerBucket.api_key
      ? providerBucket
      : null);
}

function environmentCredential({
  organization_id,
  provider,
  credential_id,
}) {
  const store = environmentStore();
  if (!store) return null;

  const organizationBuckets = [
    object(store.organizations?.[organization_id]),
    object(store[organization_id]),
  ].filter(Boolean);

  for (const bucket of organizationBuckets) {
    const credential = fromBucket(bucket, provider, credential_id);
    if (credential) return credential;
  }

  const globalBuckets = [
    object(store.providers),
    store,
  ].filter(Boolean);

  for (const bucket of globalBuckets) {
    const credential = fromBucket(bucket, provider, credential_id);
    if (credential) return credential;
  }

  return null;
}

export function registerProviderCredentialResolver(provider, resolver) {
  const providerId = normalized(provider);
  if (!providerId) throw new Error("provider required");
  if (typeof resolver !== "function") {
    throw new Error("credential resolver function required");
  }
  resolvers.set(providerId, resolver);
}

export function providerCredentialReadiness() {
  let environmentConfigured = false;
  let environmentValid = true;

  try {
    environmentConfigured = Boolean(environmentStore());
  } catch {
    environmentValid = false;
  }

  return {
    configured: resolvers.size > 0 || environmentConfigured,
    registered_resolver_count: resolvers.size,
    environment_configured: environmentConfigured,
    environment_valid: environmentValid,
  };
}

export async function resolveProviderCredential({
  organization_id,
  provider,
  credential_id = null,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  const providerId = normalized(provider);
  if (!providerId) throw new Error("provider required");

  const resolver = resolvers.get(providerId);
  const credential = resolver
    ? await resolver({
        organization_id,
        provider: providerId,
        credential_id,
      })
    : environmentCredential({
        organization_id,
        provider: providerId,
        credential_id,
      });

  if (!credential) return null;
  if (!object(credential)) {
    throw new Error("PROVIDER_CREDENTIAL_INVALID");
  }

  return { ...credential };
}

export const ProviderCredentialRuntime = {
  register: registerProviderCredentialResolver,
  readiness: providerCredentialReadiness,
  resolve: resolveProviderCredential,
};
