import { listActiveByProvider } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { registerProviderCredentialResolver } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseSecret(reference) {
  const normalized = text(reference);
  if (!normalized) return {};
  try {
    return object(JSON.parse(normalized));
  } catch {
    return { access_token: normalized };
  }
}

registerProviderCredentialResolver(
  "threads",
  async ({ organization_id, credential_id = null }) => {
    const rows = await listActiveByProvider("threads");
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
    const secret = parseSecret(selected.secret_reference);
    if (!text(secret.access_token)) return null;

    return {
      credential_id: selected.id,
      access_token: text(secret.access_token),
      token_type: text(secret.token_type) || "bearer",
      expires_in: Number(secret.expires_in) || null,
      token_lifecycle: text(secret.token_lifecycle) || null,
      token_obtained_at: text(secret.token_obtained_at) || null,
      token_expires_at: text(secret.token_expires_at) || null,
      external_account_id: text(metadata.external_account_id) || null,
      username: text(metadata.username) || null,
      credential_updated_at: selected.updated_at || selected.created_at || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_SOCIAL_CONNECTION",
    };
  },
);
