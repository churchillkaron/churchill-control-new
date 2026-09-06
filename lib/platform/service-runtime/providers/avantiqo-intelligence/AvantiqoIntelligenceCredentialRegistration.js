import {
  registerProviderCredentialResolver,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import {
  getActiveByProviderAndId,
  listActiveByProvider,
} from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const PROVIDER_ID = "avantiqo-intelligence";
const CREDENTIAL_TYPE = "managed_modal_credentials";
const CREDENTIAL_PURPOSE = "AVANTIQO_OWNED_INTELLIGENCE";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function enabled(row) {
  const metadata = object(row?.metadata);
  return metadata.enabled !== false && metadata.active !== false;
}

function organizationAllowed(row, organizationId) {
  const scopedOrganizationId = text(object(row?.metadata).organization_id);
  return !scopedOrganizationId || scopedOrganizationId === text(organizationId);
}

function governedReference(row) {
  const reference = text(row?.secret_reference).toLowerCase();
  return reference.startsWith("env:") || reference.startsWith("vault:");
}

function isIntelligenceCredential(row, organizationId) {
  const metadata = object(row?.metadata);
  return (
    enabled(row) &&
    organizationAllowed(row, organizationId) &&
    text(metadata.purpose).toUpperCase() === CREDENTIAL_PURPOSE &&
    text(row?.credential_type).toLowerCase() === CREDENTIAL_TYPE &&
    governedReference(row)
  );
}

function parseModalCredential(secret) {
  let parsed;
  try {
    parsed = JSON.parse(text(secret));
  } catch {
    throw new Error("AVANTIQO_INTELLIGENCE_CREDENTIAL_JSON_INVALID");
  }

  const payload = object(parsed);
  const modalTokenId = text(payload.modal_token_id);
  const modalTokenSecret = text(payload.modal_token_secret);
  const modalEnvironment = text(payload.modal_environment);

  if (!modalTokenId) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_TOKEN_ID_REQUIRED");
  }
  if (!modalTokenSecret) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_TOKEN_SECRET_REQUIRED");
  }

  return {
    modal_token_id: modalTokenId,
    modal_token_secret: modalTokenSecret,
    ...(modalEnvironment ? { modal_environment: modalEnvironment } : {}),
  };
}

async function resolvedCredential(row, organizationId) {
  const resolved = await CredentialRuntime.resolve(row.id, {
    organization_id: organizationId,
  });

  if (!resolved?.secret_reference_resolved_at_runtime) {
    throw new Error("AVANTIQO_INTELLIGENCE_CREDENTIAL_RUNTIME_RESOLUTION_REQUIRED");
  }

  return {
    credential_id: row.id,
    ...parseModalCredential(resolved.secret_reference),
    managed_by: "AVANTIQO",
    credential_purpose: CREDENTIAL_PURPOSE,
    credential_runtime_source: resolved.secret_reference_resolution_source,
  };
}

registerProviderCredentialResolver(
  PROVIDER_ID,
  async ({ organization_id, credential_id = null }) => {
    const organizationId = text(organization_id);
    if (!organizationId) throw new Error("organization_id required");

    const credentialId = text(credential_id);
    if (credentialId) {
      const selected = await getActiveByProviderAndId({
        provider_id: PROVIDER_ID,
        credential_id: credentialId,
      });

      if (!selected || !isIntelligenceCredential(selected, organizationId)) {
        return null;
      }

      return resolvedCredential(selected, organizationId);
    }

    const rows = await listActiveByProvider(PROVIDER_ID);
    const candidates = rows
      .filter((row) => isIntelligenceCredential(row, organizationId))
      .sort((left, right) => {
        const leftPriority = Number(object(left.metadata).priority || 0);
        const rightPriority = Number(object(right.metadata).priority || 0);
        return rightPriority - leftPriority;
      });

    const selected = candidates[0] || null;
    if (!selected) return null;
    return resolvedCredential(selected, organizationId);
  },
);

export const AVANTIQO_INTELLIGENCE_CREDENTIAL_TYPE = CREDENTIAL_TYPE;
export const AVANTIQO_INTELLIGENCE_CREDENTIAL_PURPOSE = CREDENTIAL_PURPOSE;
