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

registerProviderCredentialResolver(
  "whatsapp",
  async ({ organization_id, credential_id = null }) => {
    const rows = await listActiveByProvider("whatsapp");

    const selected = rows
      .filter((row) => {
        const metadata = object(row.metadata);
        return (
          text(metadata.organization_id) === text(organization_id) &&
          text(metadata.purpose).toUpperCase() === "ORGANIZATION_WHATSAPP_BUSINESS" &&
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
    const accessToken = resolveSecret(selected.secret_reference);
    if (!accessToken) return null;

    return {
      credential_id: selected.id,
      access_token: accessToken,
      phone_number_id: metadata.phone_number_id || null,
      waba_id: metadata.waba_id || null,
      business_id: metadata.business_id || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_WHATSAPP_BUSINESS",
    };
  },
);
