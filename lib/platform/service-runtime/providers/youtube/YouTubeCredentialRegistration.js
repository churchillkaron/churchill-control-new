import { listActiveByProvider } from "../../credentials/repositories/CredentialRepository.js";
import { resolveProviderCredentialSecret } from "../../credentials/runtime/ProviderCredentialSecretBroker.js";
import { registerProviderCredentialResolver } from "../ProviderCredentialRuntime.js";

function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

registerProviderCredentialResolver("youtube", async ({ organization_id, credential_id = null }) => {
  const rows = await listActiveByProvider("youtube");
  const selected = rows.filter((row)=>{
    const metadata=object(row.metadata);
    return text(metadata.organization_id)===text(organization_id)
      && text(metadata.purpose).toUpperCase()==="ORGANIZATION_YOUTUBE_CONNECTION"
      && metadata.enabled !== false
      && (!credential_id || text(row.id)===text(credential_id));
  }).sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0))[0] || null;
  if(!selected) return null;
  const resolved = await resolveProviderCredentialSecret({
    credential_id:selected.id,
    provider_id:"youtube",
    organization_id,
    secret_reference:selected.secret_reference,
  });
  let secret={};
  try { secret=object(JSON.parse(resolved.secret)); } catch { return null; }
  if(!text(secret.access_token)) return null;
  const metadata=object(selected.metadata);
  return {
    credential_id:selected.id,
    access_token:text(secret.access_token),
    refresh_token:text(secret.refresh_token) || null,
    expires_at:text(secret.expires_at) || null,
    scope:text(secret.scope) || null,
    token_type:text(secret.token_type) || "Bearer",
    channel_id:text(metadata.channel_id) || null,
    channel_title:text(metadata.channel_title) || null,
    managed_by:"ORGANIZATION",
    credential_purpose:"ORGANIZATION_YOUTUBE_CONNECTION",
  };
});
