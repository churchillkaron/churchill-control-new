import {
  save,
  get,
} from "../repositories/CredentialRepository";
import {
  resolveProviderCredentialSecret,
} from "./ProviderCredentialSecretBroker";

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
