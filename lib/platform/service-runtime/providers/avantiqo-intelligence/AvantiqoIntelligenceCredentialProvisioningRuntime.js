const CONTRACT = "AVANTIQO_INTELLIGENCE_LOCAL_ONLY_CREDENTIAL_COMPATIBILITY_V1";

function localOnlyStatus(organizationId = null) {
  return {
    contract: CONTRACT,
    organization_id: organizationId || null,
    mode: "LOCAL_ONLY",
    provider: "avantiqo-intelligence",
    credential_required: false,
    credential_provisioning_allowed: false,
    external_compute_allowed: false,
    external_provider_job_submitted: false,
    secret_material_returned: false,
  };
}

export async function provisionOwnedIntelligenceCredentialFromServerEnvironment({
  organizationId = null,
} = {}) {
  const error = new Error("AVANTIQO_INTELLIGENCE_CREDENTIALS_NOT_USED_LOCAL_ONLY");
  error.code = "AVANTIQO_INTELLIGENCE_CREDENTIALS_NOT_USED_LOCAL_ONLY";
  error.status = 410;
  error.details = localOnlyStatus(organizationId);
  throw error;
}

export async function ownedIntelligenceCredentialProvisioningStatus({
  organizationId = null,
} = {}) {
  return localOnlyStatus(organizationId);
}
