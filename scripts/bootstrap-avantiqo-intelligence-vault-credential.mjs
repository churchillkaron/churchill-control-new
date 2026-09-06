import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_VAULT_CREDENTIAL_BOOTSTRAP_V1";
const PROVIDER = "avantiqo-intelligence";
const CREDENTIAL_TYPE = "managed_modal_credentials";
const PURPOSE = "AVANTIQO_OWNED_INTELLIGENCE";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function assert(condition, code) {
  if (!condition) throw new Error(`${CONTRACT}_${code}`);
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const {
  ownedIntelligenceCredentialProvisioningStatus,
  provisionOwnedIntelligenceCredentialFromServerEnvironment,
} = await import(
  "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialProvisioningRuntime"
);
await import(
  "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceCredentialRegistration"
);
const {
  resolveProviderCredential,
} = await import("@/lib/platform/service-runtime/providers/ProviderCredentialRuntime");

const organizationResult = await supabaseAdmin
  .from("organizations")
  .select("id,name,organization_type,status,organization_status")
  .eq("name", CANONICAL_ORGANIZATION_NAME)
  .eq("organization_type", CANONICAL_ORGANIZATION_TYPE)
  .eq("status", "active")
  .eq("organization_status", "ACTIVE")
  .limit(3);

if (organizationResult.error) {
  throw new Error(`${CONTRACT}_PLATFORM_ORGANIZATION_QUERY_FAILED`);
}

const organizations = Array.isArray(organizationResult.data)
  ? organizationResult.data
  : [];
assert(
  organizations.length === 1 && text(organizations[0]?.id),
  `PLATFORM_ORGANIZATION_RESOLUTION_FAILED:${organizations.length}`,
);
const organizationId = text(organizations[0].id, 200);

const before = await ownedIntelligenceCredentialProvisioningStatus({
  organization_id: organizationId,
});

const provisioned = await provisionOwnedIntelligenceCredentialFromServerEnvironment({
  organization_id: organizationId,
});
assert(provisioned?.status === "ACTIVE", "PROVISION_STATUS_NOT_ACTIVE");
assert(
  provisioned?.secret_reference_scheme === "vault",
  "PROVISION_REFERENCE_NOT_VAULT",
);

const after = await ownedIntelligenceCredentialProvisioningStatus({
  organization_id: organizationId,
});
assert(after?.provisioned === true, "STATUS_NOT_PROVISIONED");
assert(after?.status === "ACTIVE", "STATUS_NOT_ACTIVE");
assert(after?.secret_reference_scheme === "vault", "STATUS_REFERENCE_NOT_VAULT");
assert(
  text(after?.credential_id) === text(provisioned?.credential_id),
  "STATUS_CREDENTIAL_ID_MISMATCH",
);

const resolved = await resolveProviderCredential({
  organization_id: organizationId,
  provider: PROVIDER,
  credential_id: after.credential_id,
});
assert(resolved && typeof resolved === "object", "RUNTIME_CREDENTIAL_NOT_RESOLVED");
assert(text(resolved.modal_token_id), "RUNTIME_MODAL_TOKEN_ID_MISSING");
assert(text(resolved.modal_token_secret), "RUNTIME_MODAL_TOKEN_SECRET_MISSING");
assert(
  text(resolved.credential_runtime_source).toLowerCase() === "vault",
  "RUNTIME_SOURCE_NOT_VAULT",
);
assert(text(resolved.credential_id) === text(after.credential_id), "RUNTIME_CREDENTIAL_ID_MISMATCH");
assert(text(resolved.managed_by).toUpperCase() === "AVANTIQO", "RUNTIME_OWNER_INVALID");
assert(
  text(resolved.credential_purpose).toUpperCase() === PURPOSE,
  "RUNTIME_PURPOSE_INVALID",
);

const rowsResult = await supabaseAdmin
  .from("provider_credentials")
  .select("id,provider_id,credential_type,status,secret_reference,metadata")
  .eq("provider_id", PROVIDER)
  .eq("credential_type", CREDENTIAL_TYPE)
  .eq("status", "ACTIVE");
if (rowsResult.error) throw new Error(`${CONTRACT}_ACTIVE_ROW_QUERY_FAILED`);
const scopedRows = (Array.isArray(rowsResult.data) ? rowsResult.data : []).filter((row) => {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return text(metadata.organization_id) === organizationId
    && text(metadata.purpose).toUpperCase() === PURPOSE;
});
assert(scopedRows.length === 1, `ACTIVE_SCOPED_ROW_COUNT_INVALID:${scopedRows.length}`);
assert(
  text(scopedRows[0]?.secret_reference).toLowerCase().startsWith("vault:"),
  "ACTIVE_ROW_REFERENCE_NOT_VAULT",
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: PROVIDER,
  credential_type: CREDENTIAL_TYPE,
  purpose: PURPOSE,
  organization_resolved_from_database: true,
  previously_provisioned: before?.provisioned === true,
  operation: text(provisioned?.operation).toUpperCase() || "UNKNOWN",
  active_scoped_credential_count: scopedRows.length,
  secret_reference_scheme: "vault",
  runtime_resolution_source: "vault",
  modal_token_id_present: true,
  modal_token_secret_present: true,
  secret_material_printed: false,
  gpu_inference_performed: false,
  external_ai_used: false,
  production_vercel_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
