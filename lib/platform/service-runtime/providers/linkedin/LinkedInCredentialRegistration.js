import { listActiveByProvider } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { registerProviderCredentialResolver } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveSecret(reference) {
  const normalized = text(reference);
  if (!normalized) return null;
  if (!normalized.toLowerCase().startsWith("env:")) return normalized;

  const environmentName = normalized.slice(4).trim();
  if (!environmentName) return null;
  return text(process.env[environmentName]) || null;
}

function parseTokens(reference) {
  const secret = resolveSecret(reference);
  if (!secret) return null;

  try {
    const parsed = JSON.parse(secret);
    return object(parsed);
  } catch {
    return { access_token: secret };
  }
}

registerProviderCredentialResolver(
  "linkedin",
  async ({ organization_id, credential_id = null }) => {
    const rows = await listActiveByProvider("linkedin");

    const selected = rows
      .filter((row) => {
        const metadata = object(row.metadata);
        return (
          text(metadata.organization_id) === text(organization_id) &&
          text(metadata.purpose).toUpperCase() === "ORGANIZATION_SOCIAL_CONNECTION" &&
          metadata.enabled !== false &&
          (!credential_id || text(row.id) === text(credential_id))
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0) -
          new Date(a.updated_at || a.created_at || 0),
      )[0] || null;

    if (!selected) return null;

    const metadata = object(selected.metadata);
    const tokens = parseTokens(selected.secret_reference);
    const accessToken = text(tokens?.access_token);
    if (!accessToken) return null;

    const externalAccountId = text(metadata.external_account_id);
    const memberUrn =
      text(metadata.member_urn) ||
      (externalAccountId ? `urn:li:person:${externalAccountId}` : null);

    return {
      credential_id: selected.id,
      access_token: accessToken,
      member_urn: memberUrn,
      external_account_id: externalAccountId || null,
      scope: tokens?.scope || metadata.scopes || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_SOCIAL_CONNECTION",
    };
  },
);
