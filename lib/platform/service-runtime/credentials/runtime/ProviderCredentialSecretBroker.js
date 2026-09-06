import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function environmentSecret(reference) {
  const normalized = text(reference);
  if (!normalized.toLowerCase().startsWith("env:")) return null;

  const environmentName = normalized.slice(4).trim();
  if (!environmentName) {
    throw new Error("PROVIDER_CREDENTIAL_ENVIRONMENT_REFERENCE_INVALID");
  }

  const secret = text(process.env[environmentName]);
  if (!secret) {
    throw new Error(`PROVIDER_CREDENTIAL_ENVIRONMENT_SECRET_UNAVAILABLE:${environmentName}`);
  }

  return {
    secret,
    source: "environment",
  };
}

export async function resolveProviderCredentialSecret({
  credential_id,
  provider_id,
  organization_id = null,
  secret_reference,
} = {}) {
  const credentialId = text(credential_id);
  const providerId = text(provider_id).toLowerCase();
  const reference = text(secret_reference);

  if (!credentialId) throw new Error("PROVIDER_CREDENTIAL_ID_REQUIRED");
  if (!providerId) throw new Error("PROVIDER_CREDENTIAL_PROVIDER_REQUIRED");
  if (!reference) throw new Error("PROVIDER_CREDENTIAL_SECRET_REFERENCE_REQUIRED");

  const env = environmentSecret(reference);
  if (env) return env;

  if (!reference.toLowerCase().startsWith("vault:")) {
    throw new Error("PROVIDER_CREDENTIAL_SECRET_REFERENCE_SCHEME_UNSUPPORTED");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "resolve_provider_credential_vault_secret",
    {
      p_credential_id: credentialId,
      p_provider_id: providerId,
      p_organization_id: text(organization_id) || null,
    },
  );

  if (error) throw error;

  const secret = text(data);
  if (!secret) {
    throw new Error("PROVIDER_CREDENTIAL_VAULT_SECRET_UNAVAILABLE");
  }

  return {
    secret,
    source: "vault",
  };
}
