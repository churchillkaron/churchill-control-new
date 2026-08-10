import {
  save,
  get,
} from "../repositories/CredentialRepository";

function text(value) {
  return String(value ?? "").trim();
}

function resolveSecretReference(reference) {
  const value = text(reference);
  if (!value) return null;

  if (!value.toLowerCase().startsWith("env:")) {
    return value;
  }

  const environmentName = value.slice(4).trim();
  if (!environmentName) {
    throw new Error("CREDENTIAL_ENVIRONMENT_REFERENCE_INVALID");
  }

  const secret = text(process.env[environmentName]);
  if (!secret) {
    throw new Error(`CREDENTIAL_ENVIRONMENT_SECRET_UNAVAILABLE:${environmentName}`);
  }

  return secret;
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

  async resolve(credential_id) {
    const credential = await get(credential_id);
    if (!credential) return null;

    return {
      ...credential,
      secret_reference: resolveSecretReference(credential.secret_reference),
      secret_reference_resolved_at_runtime: true,
    };
  },
};
