import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACCOUNT_TABLE = "provider_supplier_billing_accounts";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function active(value) {
  return upper(value) === "ACTIVE";
}

async function resolvePayerOrganizationId(explicitOrganizationId = null) {
  const explicit = text(explicitOrganizationId);
  if (explicit) return explicit;

  const configured = text(process.env.AVANTIQO_ORGANIZATION_ID);
  if (configured) return configured;

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,status,organization_status")
    .eq("name", "Avantiqo Platform")
    .limit(2);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1) {
    throw new Error("AVANTIQO_PAYER_ORGANIZATION_CONFIGURATION_REQUIRED");
  }

  return rows[0].id;
}

async function payerOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name,status,organization_status,country")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function legalEntities(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id,organization_id,code,legal_name,display_name,country,currency,is_active,is_default_accounting_entity,timezone")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default_accounting_entity", { ascending: false })
    .order("legal_name", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function supplierParties(organizationId) {
  const { data: profiles, error } = await supabaseAdmin
    .from("supplier_profiles")
    .select("id,organization_id,party_id,vendor_code,payment_terms,is_active,is_blocked,risk_level")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("is_blocked", false);

  if (error) throw error;
  if (!profiles?.length) return [];

  const partyIds = profiles.map((profile) => profile.party_id).filter(Boolean);
  const { data: parties, error: partiesError } = await supabaseAdmin
    .from("parties")
    .select("id,organization_id,party_type,display_name,legal_name,email,status,tax_id")
    .eq("organization_id", organizationId)
    .in("id", partyIds);

  if (partiesError) throw partiesError;
  const partyMap = new Map((parties || []).map((party) => [party.id, party]));

  return profiles.map((profile) => ({
    ...profile,
    party: partyMap.get(profile.party_id) || null,
  }));
}

async function accountRows(organizationId) {
  const { data, error } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .select("id,provider_id,payer_organization_id,payer_entity_id,supplier_party_id,billing_mode,status,currency,configuration,metadata,created_at,updated_at")
    .eq("payer_organization_id", organizationId)
    .order("provider_id", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function accountStatus({ account, entity, supplierProfile }) {
  if (!account) {
    return {
      ready: false,
      status: "SUPPLIER_ACCOUNT_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_REQUIRED",
    };
  }
  if (!active(account.status)) {
    return {
      ready: false,
      status: "SUPPLIER_ACCOUNT_INACTIVE",
      blocker: "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_INACTIVE",
    };
  }
  if (!account.payer_entity_id || !entity?.id || entity.is_active === false) {
    return {
      ready: false,
      status: "PAYER_ENTITY_REQUIRED",
      blocker: "AVANTIQO_PAYER_ENTITY_REQUIRED",
    };
  }
  if (!account.supplier_party_id || !supplierProfile?.party_id) {
    return {
      ready: false,
      status: "SUPPLIER_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_SUPPLIER_REQUIRED",
    };
  }
  if (supplierProfile.is_active === false || supplierProfile.is_blocked === true) {
    return {
      ready: false,
      status: "SUPPLIER_BLOCKED",
      blocker: "AVANTIQO_PROVIDER_SUPPLIER_NOT_ACTIVE",
    };
  }

  return { ready: true, status: "READY", blocker: null };
}

async function snapshot({ payerOrganizationId = null } = {}) {
  const organizationId = await resolvePayerOrganizationId(payerOrganizationId);
  const [organization, entities, suppliers, accounts] = await Promise.all([
    payerOrganization(organizationId),
    legalEntities(organizationId),
    supplierParties(organizationId),
    accountRows(organizationId),
  ]);

  if (!organization) throw new Error("AVANTIQO_PAYER_ORGANIZATION_NOT_FOUND");

  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.party_id, supplier]));
  const enrichedAccounts = accounts.map((account) => {
    const entity = entityMap.get(account.payer_entity_id) || null;
    const supplierProfile = supplierMap.get(account.supplier_party_id) || null;
    return {
      ...account,
      payer_entity: entity,
      supplier_profile: supplierProfile,
      supplier_party: supplierProfile?.party || null,
      ...accountStatus({ account, entity, supplierProfile }),
    };
  });

  return {
    payer_organization: organization,
    legal_entities: entities,
    suppliers,
    accounts: enrichedAccounts,
  };
}

async function providerStatus(providerId, options = {}) {
  const provider = text(providerId).toLowerCase();
  if (!provider) throw new Error("provider_id required");

  const data = await snapshot(options);
  const account = data.accounts.find((row) => row.provider_id === provider) || null;
  if (!account) {
    return {
      provider_id: provider,
      account: null,
      ready: false,
      status: "SUPPLIER_ACCOUNT_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_REQUIRED",
      payer_organization: data.payer_organization,
    };
  }

  return {
    provider_id: provider,
    account,
    ready: account.ready,
    status: account.status,
    blocker: account.blocker,
    payer_organization: data.payer_organization,
  };
}

async function save({
  provider_id,
  payer_organization_id = null,
  payer_entity_id,
  supplier_party_id,
  billing_mode = "SUPPLIER_INVOICE_OR_CHARGE",
  currency = null,
  status = "ACTIVE",
  configuration = {},
  metadata = {},
} = {}) {
  const providerId = text(provider_id).toLowerCase();
  if (!providerId) throw new Error("provider_id required");

  const organizationId = await resolvePayerOrganizationId(payer_organization_id);
  const entityId = text(payer_entity_id);
  const supplierPartyId = text(supplier_party_id);
  if (!entityId) throw new Error("payer_entity_id required");
  if (!supplierPartyId) throw new Error("supplier_party_id required");

  const [entities, suppliers] = await Promise.all([
    legalEntities(organizationId),
    supplierParties(organizationId),
  ]);
  const entity = entities.find((row) => row.id === entityId) || null;
  const supplier = suppliers.find((row) => row.party_id === supplierPartyId) || null;
  if (!entity) throw new Error("AVANTIQO_PAYER_ENTITY_NOT_ACTIVE");
  if (!supplier) throw new Error("AVANTIQO_PROVIDER_SUPPLIER_NOT_ACTIVE");

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .upsert(
      {
        provider_id: providerId,
        payer_organization_id: organizationId,
        payer_entity_id: entityId,
        supplier_party_id: supplierPartyId,
        billing_mode: upper(billing_mode) || "SUPPLIER_INVOICE_OR_CHARGE",
        status: upper(status) || "ACTIVE",
        currency: upper(currency) || entity.currency || null,
        configuration: configuration || {},
        metadata: {
          ...(metadata || {}),
          billing_owner: "AVANTIQO",
          customer_direct_provider_billing_allowed: false,
          customer_provider_payment_method_allowed: false,
        },
        updated_at: now,
      },
      { onConflict: "provider_id,payer_organization_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export const ProviderSupplierAccountRuntime = {
  resolvePayerOrganizationId,
  snapshot,
  providerStatus,
  save,
};
