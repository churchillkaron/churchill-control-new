import { listActiveByProvider } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { registerProviderCredentialResolver } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { issueLineStatelessChannelAccessToken } from "./LINEChannelAccessTokenRuntime.js";

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
  "line",
  async ({ organization_id, credential_id = null }) => {
    const rows = await listActiveByProvider("line");
    const selected = rows
      .filter((row) => {
        const metadata = object(row.metadata);
        return (
          text(metadata.organization_id) === text(organization_id) &&
          text(metadata.purpose).toUpperCase() === "ORGANIZATION_LINE_MESSAGING" &&
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
    const channelSecret = resolveSecret(selected.secret_reference);
    if (!channelSecret || !text(metadata.channel_id)) return null;

    const issued = await issueLineStatelessChannelAccessToken({
      channel_id: metadata.channel_id,
      channel_secret: channelSecret,
    });

    return {
      credential_id: selected.id,
      channel_access_token: issued.access_token,
      channel_id: metadata.channel_id,
      bot_user_id: metadata.bot_user_id || null,
      basic_id: metadata.basic_id || null,
      managed_by: "ORGANIZATION",
      credential_purpose: "ORGANIZATION_LINE_MESSAGING",
    };
  },
);
