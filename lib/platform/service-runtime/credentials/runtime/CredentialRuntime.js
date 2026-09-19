import {
  save,
  get,
} from "../repositories/CredentialRepository";
import {
  resolveProviderCredentialSecret,
} from "./ProviderCredentialSecretBroker";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

export const CredentialRuntime = {
  async store({
    provider_id,
    credential_type,
    secret_reference,
    metadata = {},
  }) {
    return save({
      provider_id,
      credential_type,
      secret_reference,
      metadata,
      status: "ACTIVE",
    });
  },

  async storeSecret({
    provider_id,
    credential_type,
    secret,
    organization_id,
    metadata = {},
    vault_name = null,
    vault_description = null,
  }) {
    const providerId = text(provider_id).toLowerCase();
    const organizationId = text(organization_id);
    const value = String(secret ?? "");
    if (!providerId) throw new Error("provider_id required");
    if (!organizationId) throw new Error("organization_id required");
    if (!value) throw new Error("credential secret required");

    const { data: secretReference, error } = await supabaseAdmin.rpc(
      "store_provider_credential_vault_secret",
      {
        p_provider_id: providerId,
        p_organization_id: organizationId,
        p_secret: value,
        p_name: text(vault_name) || null,
        p_description: text(vault_description) || null,
      },
    );
    if (error) throw error;
    if (!text(secretReference).toLowerCase().startsWith("vault:")) {
      throw new Error("PROVIDER_CREDENTIAL_VAULT_REFERENCE_INVALID");
    }

    return save({
      provider_id: providerId,
      credential_type,
      secret_reference: secretReference,
      metadata: {
        ...metadata,
        organization_id: organizationId,
      },
      status: "ACTIVE",
    });
  },

  async resolve(credential_id, { organization_id = null } = {}) {
    const credential = await get(credential_id);
    if (!credential) return null;

    const resolved = await resolveProviderCredentialSecret({
      credential_id: credential.id,
      provider_id: credential.provider_id,
      organization_id,
      secret_reference: credential.secret_reference,
    });

    return {
      ...credential,
      secret_reference: resolved.secret,
      secret_reference_resolved_at_runtime: true,
      secret_reference_resolution_source: resolved.source,
    };
  },
};
