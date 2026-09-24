import { listActiveByProvider } from "../../credentials/repositories/CredentialRepository.js";
import { resolveProviderCredentialSecret } from "../../credentials/runtime/ProviderCredentialSecretBroker.js";
import { registerProviderCredentialResolver } from "../ProviderCredentialRuntime.js";

function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

registerProviderCredentialResolver("pinterest", async ({ organization_id, credential_id = null }) => {
  const rows=await listActiveByProvider("pinterest");
  const selected=rows.filter((row)=>{
    const metadata=object(row.metadata);
    return text(metadata.organization_id)===text(organization_id)
      && text(metadata.purpose).toUpperCase()==="ORGANIZATION_PINTEREST_CONNECTION"
      && metadata.enabled !== false
      && (!credential_id || text(row.id)===text(credential_id));
  }).sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0))[0] || null;
  if(!selected) return null;
  const resolved=await resolveProviderCredentialSecret({credential_id:selected.id,provider_id:"pinterest",organization_id,secret_reference:selected.secret_reference});
  let secret={}; try{ secret=object(JSON.parse(resolved.secret)); }catch{return null;}
  if(!text(secret.access_token)) return null;
  const metadata=object(selected.metadata);
  return {
    credential_id:selected.id,
    access_token:text(secret.access_token),
    refresh_token:text(secret.refresh_token)||null,
    expires_at:text(secret.expires_at)||null,
    refresh_token_expires_at:text(secret.refresh_token_expires_at)||null,
    scope:text(secret.scope)||null,
    username:text(metadata.username)||null,
    account_type:text(metadata.account_type)||null,
    managed_by:"ORGANIZATION",
    credential_purpose:"ORGANIZATION_PINTEREST_CONNECTION",
  };
});
