import { listActiveByProvider } from "../../credentials/repositories/CredentialRepository.js";
import { resolveProviderCredentialSecret } from "../../credentials/runtime/ProviderCredentialSecretBroker.js";
import { registerProviderCredentialResolver } from "../ProviderCredentialRuntime.js";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

registerProviderCredentialResolver("telegram", async ({ organization_id, credential_id = null }) => {
  const rows = await listActiveByProvider("telegram");
  const selected = rows
    .filter((row) => {
      const metadata = object(row.metadata);
      return text(metadata.organization_id) === text(organization_id)
        && text(metadata.purpose).toUpperCase() === "ORGANIZATION_TELEGRAM_BOT"
        && metadata.enabled !== false
        && (!credential_id || text(row.id) === text(credential_id));
    })
    .sort((a,b)=>new Date(b.updated_at || b.created_at || 0)-new Date(a.updated_at || a.created_at || 0))[0] || null;
  if (!selected) return null;
  const resolved = await resolveProviderCredentialSecret({
    credential_id:selected.id,
    provider_id:"telegram",
    organization_id,
    secret_reference:selected.secret_reference,
  });
  if (!resolved?.secret) return null;
  const metadata = object(selected.metadata);
  return {
    credential_id:selected.id,
    bot_token:resolved.secret,
    bot_id:metadata.bot_id || null,
    bot_username:metadata.bot_username || null,
    managed_by:"ORGANIZATION",
    credential_purpose:"ORGANIZATION_TELEGRAM_BOT",
  };
});
