#!/usr/bin/env node

const result = {
  success: false,
  contract: "AVANTIQO_INTELLIGENCE_LOCAL_ONLY_CREDENTIAL_BOOTSTRAP_V1",
  error: "AVANTIQO_INTELLIGENCE_CREDENTIALS_NOT_USED_LOCAL_ONLY",
  credential_required: false,
  credential_provisioning_allowed: false,
  external_compute_allowed: false,
  secret_material_returned: false,
};

console.error(JSON.stringify(result));
process.exitCode = 2;
