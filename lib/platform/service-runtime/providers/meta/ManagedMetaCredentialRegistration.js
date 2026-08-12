import {
  registerProviderCredentialResolver,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

import {
  listActiveByProvider,
} from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function purpose(row) {
  return text(object(row?.metadata).purpose).toUpperCase();
}

function enabled(row) {
  const metadata = object(row?.metadata);
  return metadata.enabled !== false && metadata.active !== false;
}

function secretEnvironmentName(reference) {
  const normalized = text(reference);
  if (!normalized.toLowerCase().startsWith("env:")) return null;
  return normalized.slice(4).trim() || null;
}

function directOrEnvironmentSecret(reference) {
  const normalized = text(reference);
  if (!normalized) return null;
  const environmentName = secretEnvironmentName(normalized);
  if (!environmentName) return normalized;
  return text(process.env[environmentName]) || null;
}

function managedAccessToken(row) {
  const environmentName = secretEnvironmentName(row?.secret_reference);
  if (!environmentName) {
    throw new Error("MANAGED_META_SECRET_REFERENCE_INVALID");
  }

  const accessToken = text(process.env[environmentName]);
  if (!accessToken) {
    throw new Error(`MANAGED_META_SECRET_UNAVAILABLE:${environmentName}`);
  }

  return accessToken;
}

function isManagedAdvertisingCredential(row) {
  const environmentName = secretEnvironmentName(row?.secret_reference);

  return (
    enabled(row) &&
    purpose(row) === "AVANTIQO_MANAGED_ADVERTISING" &&
    text(row?.credential_type).toLowerCase() === "managed_access_token" &&
    Boolean(environmentName) &&
    Boolean(text(object(row?.metadata).ad_account_id))
  );
}

function isOrganizationMessagingCredential(row, organizationId) {
  const metadata = object(row?.metadata);
  return (
    enabled(row) &&
    purpose(row) === "ORGANIZATION_CHANNEL_PUBLISHING" &&
    text(row?.credential_type).toLowerCase() === "oauth_page_token" &&
    text(metadata.organization_id) === text(organizationId) &&
    Boolean(text(metadata.page_id)) &&
    Boolean(directOrEnvironmentSecret(row?.secret_reference))
  );
}

async function organizationMessagingCredential({
  organization_id,
  credential_id = null,
  requireInstagram = false,
}) {
  const rows = await listActiveByProvider("meta");
  const selected = rows
    .filter((row) => isOrganizationMessagingCredential(row, organization_id))
    .filter((row) => !credential_id || text(row.id) === text(credential_id))
    .filter((row) => !requireInstagram || Boolean(text(object(row.metadata).instagram_business_id)))
    .sort(
      (left, right) =>
        new Date(right.updated_at || right.created_at || 0) -
        new Date(left.updated_at || left.created_at || 0),
    )[0] || null;

  if (!selected) return null;
  const metadata = object(selected.metadata);
  const accessToken = directOrEnvironmentSecret(selected.secret_reference);
  if (!accessToken) return null;

  return {
    credential_id: selected.id,
    access_token: accessToken,
    page_id: metadata.page_id || null,
    page_name: metadata.page_name || null,
    instagram_business_id: metadata.instagram_business_id || null,
    managed_by: "ORGANIZATION",
    credential_purpose: "ORGANIZATION_CHANNEL_PUBLISHING",
  };
}

registerProviderCredentialResolver(
  "meta",
  async ({ credential_id = null }) => {
    const rows = await listActiveByProvider("meta");

    const candidates = rows
      .filter(isManagedAdvertisingCredential)
      .filter((row) => !credential_id || text(row.id) === text(credential_id))
      .sort((left, right) => {
        const leftPriority = Number(object(left.metadata).priority || 0);
        const rightPriority = Number(object(right.metadata).priority || 0);
        return rightPriority - leftPriority;
      });

    const selected = candidates[0] || null;
    if (!selected) return null;

    const metadata = object(selected.metadata);

    return {
      credential_id: selected.id,
      access_token: managedAccessToken(selected),
      ad_account_id: metadata.ad_account_id,
      currency: metadata.currency || null,
      whatsapp_ads_enabled: metadata.whatsapp_ads_enabled === true,
      managed_by: "AVANTIQO",
      credential_purpose: "AVANTIQO_MANAGED_ADVERTISING",
    };
  },
);

registerProviderCredentialResolver(
  "facebook_messenger",
  async ({ organization_id, credential_id = null }) =>
    organizationMessagingCredential({
      organization_id,
      credential_id,
      requireInstagram: false,
    }),
);

registerProviderCredentialResolver(
  "instagram_messaging",
  async ({ organization_id, credential_id = null }) =>
    organizationMessagingCredential({
      organization_id,
      credential_id,
      requireInstagram: true,
    }),
);
