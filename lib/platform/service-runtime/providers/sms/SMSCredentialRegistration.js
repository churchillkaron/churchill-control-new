import { listActiveByProvider } from "../../credentials/repositories/CredentialRepository.js";
import { resolveProviderCredentialSecret } from "../../credentials/runtime/ProviderCredentialSecretBroker.js";
import { registerProviderCredentialResolver } from "../ProviderCredentialRuntime.js";

function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

registerProviderCredentialResolver("sms", async ({ organization_id, credential_id = null }) => {
  const rows=await listActiveByProvider("sms");
  const selected=rows.filter((row)=>{
    const metadata=object(row.metadata);
    return text(metadata.organization_id)===text(organization_id)
      && text(metadata.purpose).toUpperCase()==="ORGANIZATION_SMS_CONNECTION"
      && metadata.enabled !== false
      && (!credential_id || text(row.id)===text(credential_id));
  }).sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0))[0] || null;
  if(!selected) return null;
  const resolved=await resolveProviderCredentialSecret({credential_id:selected.id,provider_id:"sms",organization_id,secret_reference:selected.secret_reference});
  let secret={}; try{ secret=object(JSON.parse(resolved.secret)); }catch{return null;}
  if(!text(secret.account_sid) || !text(secret.auth_token)) return null;
  const metadata=object(selected.metadata);
  return {
    credential_id:selected.id,
    account_sid:text(secret.account_sid),
    auth_token:text(secret.auth_token),
    from_number:text(secret.from_number) || null,
    messaging_service_sid:text(secret.messaging_service_sid) || null,
    status_callback_url:text(metadata.status_callback_url) || null,
    managed_by:"ORGANIZATION",
    credential_purpose:"ORGANIZATION_SMS_CONNECTION",
  };
});
