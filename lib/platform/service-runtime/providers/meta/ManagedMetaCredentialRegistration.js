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

function isManagedAdvertisingCredential(row) {
  return (
    enabled(row) &&
    purpose(row) === "AVANTIQO_MANAGED_ADVERTISING" &&
    text(row?.credential_type).toLowerCase() === "managed_access_token" &&
    Boolean(text(row?.secret_reference)) &&
    Boolean(text(object(row?.metadata).ad_account_id))
  );
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
      access_token: selected.secret_reference,
      ad_account_id: metadata.ad_account_id,
      currency: metadata.currency || null,
      whatsapp_ads_enabled: metadata.whatsapp_ads_enabled === true,
      managed_by: "AVANTIQO",
      credential_purpose: "AVANTIQO_MANAGED_ADVERTISING",
    };
  },
);
