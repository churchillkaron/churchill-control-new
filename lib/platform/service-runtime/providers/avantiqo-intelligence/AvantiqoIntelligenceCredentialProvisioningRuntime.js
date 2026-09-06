import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function processCredential() {
  const modalTokenId = text(
    process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID,
  );
  const modalTokenSecret = text(
    process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET,
  );
  const modalEnvironment = text(
    process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT,
  );

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

function publicResult(row) {
  return {
    credential_id: text(row?.credential_id) || null,
    provider_id: "avantiqo-intelligence",
    credential_type: "managed_modal_credentials",
    purpose: "AVANTIQO_OWNED_INTELLIGENCE",
    status: text(row?.status).toUpperCase() || "UNKNOWN",
    operation: text(row?.operation).toUpperCase() || "UNKNOWN",
    secret_transport: "SUPABASE_VAULT",
    secret_reference_scheme: "vault",
  };
}

export async function provisionOwnedIntelligenceCredentialFromServerEnvironment({
  organization_id,
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) {
    throw new Error("organization_id required");
  }

  const credential = processCredential();
  const secretPayload = JSON.stringify(credential);

  const { data, error } = await supabaseAdmin.rpc(
    "provision_owned_intelligence_modal_credential",
    {
      p_organization_id: organizationId,
      p_secret_payload: secretPayload,
    },
  );

  if (error) {
    throw new Error(
      text(error.code)
        ? `OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_FAILED:${text(error.code)}`
        : "OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_FAILED",
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.credential_id || text(row?.status).toUpperCase() !== "ACTIVE") {
    throw new Error("OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_RESULT_INVALID");
  }

  return publicResult(row);
}

export async function ownedIntelligenceCredentialProvisioningStatus({
  organization_id,
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) {
    throw new Error("organization_id required");
  }

  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .select("id,provider_id,credential_type,secret_reference,status,metadata,created_at,updated_at")
    .eq("provider_id", "avantiqo-intelligence")
    .eq("credential_type", "managed_modal_credentials")
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(
      text(error.code)
        ? `OWNED_INTELLIGENCE_CREDENTIAL_STATUS_FAILED:${text(error.code)}`
        : "OWNED_INTELLIGENCE_CREDENTIAL_STATUS_FAILED",
    );
  }

  const row = (Array.isArray(data) ? data : []).find((candidate) => {
    const metadata = candidate?.metadata && typeof candidate.metadata === "object"
      ? candidate.metadata
      : {};
    return text(metadata.organization_id) === organizationId
      && text(metadata.purpose).toUpperCase() === "AVANTIQO_OWNED_INTELLIGENCE";
  }) || null;

  if (!row) {
    return {
      provisioned: false,
      provider_id: "avantiqo-intelligence",
      credential_type: "managed_modal_credentials",
      purpose: "AVANTIQO_OWNED_INTELLIGENCE",
    };
  }

  const reference = text(row.secret_reference);
  return {
    provisioned: reference.toLowerCase().startsWith("vault:"),
    credential_id: text(row.id) || null,
    provider_id: "avantiqo-intelligence",
    credential_type: "managed_modal_credentials",
    purpose: "AVANTIQO_OWNED_INTELLIGENCE",
    status: text(row.status).toUpperCase(),
    secret_reference_scheme: reference.includes(":")
      ? reference.slice(0, reference.indexOf(":")).toLowerCase()
      : "unsupported",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}
