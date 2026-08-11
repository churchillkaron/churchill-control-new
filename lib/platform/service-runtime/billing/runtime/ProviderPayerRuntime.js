import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER_PAYER_ROLE = "AVANTIQO_LEGAL_PROVIDER_PAYER";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function organizationIsActive(row = {}) {
  const status = upper(row.status || row.organization_status);
  return !status || status === "ACTIVE";
}

async function payerEntityRows() {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select(
      "id,organization_id,code,legal_name,display_name,country,currency,is_active,is_default_accounting_entity,timezone,governance_legacy_values",
    )
    .eq("is_active", true)
    .contains("governance_legacy_values", { platform_role: PROVIDER_PAYER_ROLE })
    .limit(2);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function activeOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id,name,legal_name,organization_type,parent_organization_id,status,organization_status,country",
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !organizationIsActive(data)) {
    throw new Error("AVANTIQO_PROVIDER_PAYER_ORGANIZATION_NOT_ACTIVE");
  }

  return data;
}

async function resolveProviderPayer({ organizationId = null } = {}) {
  const configuredOrganizationId =
    text(organizationId) || text(process.env.AVANTIQO_PROVIDER_PAYER_ORGANIZATION_ID);
  const entities = await payerEntityRows();

  if (entities.length !== 1) {
    throw new Error("AVANTIQO_PROVIDER_PAYER_ORGANIZATION_CONFIGURATION_REQUIRED");
  }

  const entity = entities[0];
  if (!entity.organization_id) {
    throw new Error("AVANTIQO_PROVIDER_PAYER_ORGANIZATION_CONFIGURATION_REQUIRED");
  }

  if (
    configuredOrganizationId &&
    configuredOrganizationId !== entity.organization_id
  ) {
    throw new Error("AVANTIQO_PROVIDER_PAYER_ORGANIZATION_CONFIGURATION_MISMATCH");
  }

  const organization = await activeOrganization(entity.organization_id);
  return {
    role: PROVIDER_PAYER_ROLE,
    organization,
    entity,
    organization_id: organization.id,
    entity_id: entity.id,
  };
}

async function resolveProviderPayerOrganizationId(explicitOrganizationId = null) {
  const payer = await resolveProviderPayer({ organizationId: explicitOrganizationId });
  return payer.organization_id;
}

async function resolveProviderPayerEntityId(explicitOrganizationId = null) {
  const payer = await resolveProviderPayer({ organizationId: explicitOrganizationId });
  return payer.entity_id;
}

export const ProviderPayerRuntime = {
  role: PROVIDER_PAYER_ROLE,
  resolve: resolveProviderPayer,
  resolveProviderPayerOrganizationId,
  resolveProviderPayerEntityId,
};
