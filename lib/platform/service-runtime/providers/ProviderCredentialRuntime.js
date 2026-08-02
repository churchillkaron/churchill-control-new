import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  findActiveByProvider,
} from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";

const resolvers = new Map();

const PROVIDER_ALIASES = {
  fal: ["fal", "fal_ai", "fal-ai", "falai", "fal.ai", "flux"],
  runway: ["runway", "runwayml", "runway_ml", "runway-ml"],
};

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function providerAliases(provider) {
  const providerId = normalized(provider);
  return [
    ...new Set([
      providerId,
      ...(PROVIDER_ALIASES[providerId] || []),
    ].map(normalized).filter(Boolean)),
  ];
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

function fromBucket(bucket, providers, credentialId) {
  for (const provider of providers) {
    const providerBucket = object(bucket?.[provider]);
    if (!providerBucket) continue;

    if (credentialId && object(providerBucket[credentialId])) {
      return providerBucket[credentialId];
    }

    const credential = object(providerBucket.default) ||
      (providerBucket.access_token ||
      providerBucket.api_key ||
      providerBucket.secret_reference
        ? providerBucket
        : null);
    if (credential) return credential;
  }

  return null;
}

function environmentCredential({
  organization_id,
  provider,
  credential_id,
}) {
  const store = environmentStore();
  if (!store) return null;
  const providers = providerAliases(provider);

  const organizationBuckets = [
    object(store.organizations?.[organization_id]),
    object(store[organization_id]),
  ].filter(Boolean);

  for (const bucket of organizationBuckets) {
    const credential = fromBucket(bucket, providers, credential_id);
    if (credential) return credential;
  }

  const globalBuckets = [
    object(store.providers),
    store,
  ].filter(Boolean);

  for (const bucket of globalBuckets) {
    const credential = fromBucket(bucket, providers, credential_id);
    if (credential) return credential;
  }

  return null;
}

function environmentKeyMatches(key = "", prefix = "") {
  if (!key || !prefix || key.startsWith("NEXT_PUBLIC_")) return false;
  if (!(key === `${prefix}_KEY` || key.startsWith(`${prefix}_`))) return false;
  return /(?:^|_)(?:API_)?(?:KEY|TOKEN|SECRET|CREDENTIAL)$/.test(key) ||
    /(?:^|_)ACCESS_TOKEN$/.test(key);
}

function environmentPrefixes(provider) {
  return providerAliases(provider)
    .map((value) => value.replace(/[^a-z0-9]+/g, "_"))
    .map((value) => value.replace(/^_+|_+$/g, "").toUpperCase())
    .filter(Boolean);
}

function directEnvironmentCredential(provider) {
  const basePrefixes = environmentPrefixes(provider);
  const prefixes = [
    ...new Set([
      ...basePrefixes,
      ...basePrefixes.map((prefix) => `AVANTIQO_${prefix}`),
    ]),
  ];
  if (!prefixes.length) return null;

  const explicit = prefixes.flatMap((prefix) => [
    `${prefix}_API_KEY`,
    `${prefix}_KEY`,
    `${prefix}_API_TOKEN`,
    `${prefix}_TOKEN`,
    `${prefix}_API_SECRET`,
    `${prefix}_SECRET`,
    `${prefix}_ACCESS_TOKEN`,
  ]);
  const discovered = Object.keys(process.env)
    .filter((key) => prefixes.some((candidate) =>
      environmentKeyMatches(key, candidate),
    ));

  for (const key of [...new Set([...explicit, ...discovered])]) {
    const secret = text(process.env[key]);
    if (!secret) continue;
    return {
      api_key: secret,
      access_token: secret,
      token: secret,
      secret_reference: secret,
      metadata: {
        source: "provider_environment",
        environment_key: key,
      },
    };
  }

  return null;
}

function validateCredentialScope(credential, {
  organization_id,
  provider,
  credential_id,
}) {
  const record = object(credential);
  if (!record) return null;

  if (
    record.organization_id &&
    String(record.organization_id) !== String(organization_id)
  ) {
    throw new Error(
      `PROVIDER_CREDENTIAL_ORGANIZATION_MISMATCH:${credential_id || record.id || "unknown"}`,
    );
  }

  const aliases = new Set(providerAliases(provider));
  const credentialProvider = normalized(
    record.provider_id || record.provider || record.metadata?.provider_id,
  );
  if (credentialProvider && !aliases.has(credentialProvider)) {
    throw new Error(
      `PROVIDER_CREDENTIAL_PROVIDER_MISMATCH:${credential_id || record.id || "unknown"}:${credentialProvider}:${provider}`,
    );
  }

  const status = text(record.status).toUpperCase();
  if (status && !["ACTIVE", "CONNECTED", "HEALTHY", "VERIFIED"].includes(status)) {
    throw new Error(
      `PROVIDER_CREDENTIAL_NOT_ACTIVE:${credential_id || record.id || "unknown"}:${status}`,
    );
  }

  return record;
}

async function canonicalCredential({
  organization_id,
  provider,
  credential_id,
}) {
  if (credential_id) {
    const credential = await CredentialRuntime.resolve(credential_id);
    return validateCredentialScope(credential, {
      organization_id,
      provider,
      credential_id,
    });
  }

  const credential = await findActiveByProvider({
    provider_ids: providerAliases(provider),
    organization_id,
  });
  return validateCredentialScope(credential, {
    organization_id,
    provider,
    credential_id: credential?.id || null,
  });
}

export function registerProviderCredentialResolver(provider, resolver) {
  const providerId = normalized(provider);
  if (!providerId) throw new Error("provider required");
  if (typeof resolver !== "function") {
    throw new Error("credential resolver function required");
  }
  resolvers.set(providerId, resolver);
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
    : await canonicalCredential({
        organization_id,
        provider: providerId,
        credential_id,
      }) ||
      environmentCredential({
        organization_id,
        provider: providerId,
        credential_id,
      }) ||
      directEnvironmentCredential(providerId);

  if (!credential) return null;
  if (!object(credential)) {
    throw new Error("PROVIDER_CREDENTIAL_INVALID");
  }

  return { ...credential };
}

export const ProviderCredentialRuntime = {
  register: registerProviderCredentialResolver,
  resolve: resolveProviderCredential,
};
