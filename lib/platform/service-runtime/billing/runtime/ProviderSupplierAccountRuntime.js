import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACCOUNT_TABLE = "provider_supplier_billing_accounts";
const VERIFICATION_METHODS = new Set([
  "SUPPLIER_INVOICE",
  "PROVIDER_STATEMENT",
  "BILLING_PROFILE",
  "BILLING_PORTAL",
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function active(value) {
  return upper(value) === "ACTIVE";
}

function organizationIsActive(row = {}) {
  const status = upper(row.status || row.organization_status);
  return !status || status === "ACTIVE";
}

async function resolveOperatorOrganizationId(explicitOrganizationId = null) {
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
    throw new Error("AVANTIQO_OPERATOR_ORGANIZATION_CONFIGURATION_REQUIRED");
  }

  return rows[0].id;
}

async function organizationRows() {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name,organization_type,parent_organization_id,status,organization_status,country")
    .order("name", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).filter(organizationIsActive);
}

async function legalEntityRows() {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id,organization_id,code,legal_name,display_name,country,currency,is_active,is_default_accounting_entity,timezone")
    .eq("is_active", true)
    .order("legal_name", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function supplierRows() {
  const { data: profiles, error } = await supabaseAdmin
    .from("supplier_profiles")
    .select("id,organization_id,party_id,vendor_code,payment_terms,is_active,is_blocked,risk_level")
    .eq("is_active", true)
    .eq("is_blocked", false);

  if (error) throw error;
  if (!profiles?.length) return [];

  const partyIds = profiles.map((profile) => profile.party_id).filter(Boolean);
  const { data: parties, error: partiesError } = await supabaseAdmin
    .from("parties")
    .select("id,organization_id,party_type,display_name,legal_name,email,status,tax_id")
    .in("id", partyIds);

  if (partiesError) throw partiesError;
  const partyMap = new Map((parties || []).map((party) => [party.id, party]));

  return profiles.map((profile) => ({
    ...profile,
    party: partyMap.get(profile.party_id) || null,
  }));
}

async function accountRows() {
  const { data, error } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .select("id,provider_id,payer_organization_id,payer_entity_id,supplier_party_id,billing_mode,status,currency,verification_status,verification_method,verification_reference,verified_at,verified_by,configuration,metadata,created_at,updated_at")
    .order("provider_id", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function mappingStatus({ account, payerOrganization, entity, supplierProfile }) {
  if (!account) {
    return {
      ready: false,
      status: "PAYER_ORGANIZATION_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED",
    };
  }
  if (!account.payer_organization_id || !payerOrganization?.id) {
    return {
      ready: false,
      status: "PAYER_ORGANIZATION_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED",
    };
  }
  if (!organizationIsActive(payerOrganization)) {
    return {
      ready: false,
      status: "PAYER_ORGANIZATION_INACTIVE",
      blocker: "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_INACTIVE",
    };
  }
  if (
    !account.payer_entity_id ||
    !entity?.id ||
    entity.is_active === false ||
    entity.organization_id !== account.payer_organization_id
  ) {
    return {
      ready: false,
      status: "PAYER_ENTITY_REQUIRED",
      blocker: "AVANTIQO_PAYER_ENTITY_REQUIRED",
    };
  }
  if (
    !account.supplier_party_id ||
    !supplierProfile?.party_id ||
    supplierProfile.organization_id !== account.payer_organization_id
  ) {
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

  return { ready: true, status: "MAPPING_READY", blocker: null };
}

function accountStatus({ account, payerOrganization, entity, supplierProfile }) {
  const mapping = mappingStatus({
    account,
    payerOrganization,
    entity,
    supplierProfile,
  });
  if (!mapping.ready) return mapping;

  const verification = upper(account.verification_status) || "UNVERIFIED";
  if (verification === "REJECTED") {
    return {
      ready: false,
      status: "PAYER_VERIFICATION_REJECTED",
      blocker: "AVANTIQO_PROVIDER_PAYER_VERIFICATION_REJECTED",
    };
  }
  if (verification !== "VERIFIED") {
    return {
      ready: false,
      status: "PAYER_VERIFICATION_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_PAYER_VERIFICATION_REQUIRED",
    };
  }
  if (!active(account.status)) {
    return {
      ready: false,
      status: "SUPPLIER_ACCOUNT_INACTIVE",
      blocker: "AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_INACTIVE",
    };
  }

  return { ready: true, status: "READY", blocker: null };
}

async function snapshot({
  operatorOrganizationId = null,
  payerOrganizationId = null,
} = {}) {
  const operatorId = await resolveOperatorOrganizationId(operatorOrganizationId);
  const scopedPayerOrganizationId = text(payerOrganizationId) || null;
  const [organizations, entities, suppliers, accounts] = await Promise.all([
    organizationRows(),
    legalEntityRows(),
    supplierRows(),
    accountRows(),
  ]);

  const organizationMap = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const operatorOrganization = organizationMap.get(operatorId) || null;
  if (!operatorOrganization) {
    throw new Error("AVANTIQO_OPERATOR_ORGANIZATION_NOT_FOUND");
  }

  const scopedPayerOrganization = scopedPayerOrganizationId
    ? organizationMap.get(scopedPayerOrganizationId) || null
    : null;
  if (scopedPayerOrganizationId && !scopedPayerOrganization) {
    throw new Error("AVANTIQO_PROVIDER_PAYER_ORGANIZATION_NOT_ACTIVE");
  }

  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.party_id, supplier]));

  const visibleEntities = scopedPayerOrganizationId
    ? entities.filter((entity) => entity.organization_id === scopedPayerOrganizationId)
    : entities;
  const visibleSuppliers = scopedPayerOrganizationId
    ? suppliers.filter((supplier) => supplier.organization_id === scopedPayerOrganizationId)
    : suppliers;
  const visibleAccounts = scopedPayerOrganizationId
    ? accounts.filter(
        (account) => account.payer_organization_id === scopedPayerOrganizationId,
      )
    : accounts;

  const enrichedAccounts = visibleAccounts.map((account) => {
    const payerOrganization = organizationMap.get(account.payer_organization_id) || null;
    const entity = entityMap.get(account.payer_entity_id) || null;
    const supplierProfile = supplierMap.get(account.supplier_party_id) || null;

    return {
      ...account,
      payer_organization: payerOrganization,
      payer_entity: entity,
      supplier_profile: supplierProfile,
      supplier_party: supplierProfile?.party || null,
      ...accountStatus({
        account,
        payerOrganization,
        entity,
        supplierProfile,
      }),
    };
  });

  let payerOrganizations;
  if (scopedPayerOrganizationId) {
    payerOrganizations = scopedPayerOrganization ? [scopedPayerOrganization] : [];
  } else {
    const organizationIdsWithLegalEntity = new Set(
      entities.map((entity) => entity.organization_id).filter(Boolean),
    );
    const organizationIdsWithAccount = new Set(
      accounts.map((account) => account.payer_organization_id).filter(Boolean),
    );

    payerOrganizations = organizations.filter(
      (organization) =>
        organizationIdsWithLegalEntity.has(organization.id) ||
        organizationIdsWithAccount.has(organization.id),
    );
  }

  return {
    operator_organization: operatorOrganization,
    payer_organization: scopedPayerOrganization,
    payer_organizations: payerOrganizations,
    legal_entities: visibleEntities,
    suppliers: visibleSuppliers,
    accounts: enrichedAccounts,
    verification_methods: [...VERIFICATION_METHODS],
    scope: {
      payer_organization_id: scopedPayerOrganizationId,
    },
  };
}

async function providerStatus(providerId, options = {}) {
  const provider = text(providerId).toLowerCase();
  if (!provider) throw new Error("provider_id required");

  const data = await snapshot(options);
  const providerAccounts = data.accounts.filter((row) => row.provider_id === provider);
  const activeAccounts = providerAccounts.filter((row) => active(row.status));

  if (activeAccounts.length > 1) {
    throw new Error(`AVANTIQO_PROVIDER_PAYER_AMBIGUOUS:${provider}`);
  }

  const account = activeAccounts[0] || providerAccounts[0] || null;
  if (!account) {
    return {
      provider_id: provider,
      account: null,
      ready: false,
      status: "PAYER_ORGANIZATION_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED",
      operator_organization: data.operator_organization,
    };
  }

  return {
    provider_id: provider,
    account,
    ready: account.ready,
    status: account.status,
    blocker: account.blocker,
    operator_organization: data.operator_organization,
  };
}

async function save({
  provider_id,
  payer_organization_id,
  payer_entity_id,
  supplier_party_id,
  billing_mode = "SUPPLIER_INVOICE_OR_CHARGE",
  currency = null,
  configuration = {},
  metadata = {},
} = {}) {
  const providerId = text(provider_id).toLowerCase();
  if (!providerId) throw new Error("provider_id required");

  const payerOrganizationId = text(payer_organization_id);
  const entityId = text(payer_entity_id);
  const supplierPartyId = text(supplier_party_id);

  if (!payerOrganizationId) throw new Error("payer_organization_id required");
  if (!entityId) throw new Error("payer_entity_id required");
  if (!supplierPartyId) throw new Error("supplier_party_id required");

  const [organizations, entities, suppliers] = await Promise.all([
    organizationRows(),
    legalEntityRows(),
    supplierRows(),
  ]);

  const payerOrganization =
    organizations.find((row) => row.id === payerOrganizationId) || null;
  const entity =
    entities.find(
      (row) =>
        row.id === entityId && row.organization_id === payerOrganizationId,
    ) || null;
  const supplier =
    suppliers.find(
      (row) =>
        row.party_id === supplierPartyId &&
        row.organization_id === payerOrganizationId,
    ) || null;

  if (!payerOrganization) {
    throw new Error("AVANTIQO_PROVIDER_PAYER_ORGANIZATION_NOT_ACTIVE");
  }
  if (!entity) throw new Error("AVANTIQO_PAYER_ENTITY_NOT_ACTIVE");
  if (!supplier) throw new Error("AVANTIQO_PROVIDER_SUPPLIER_NOT_ACTIVE");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .select("id,payer_entity_id,supplier_party_id,verification_status,verification_method,verification_reference,verified_at,verified_by")
    .eq("provider_id", providerId)
    .eq("payer_organization_id", payerOrganizationId)
    .maybeSingle();

  if (existingError) throw existingError;

  const mappingUnchanged =
    existing?.payer_entity_id === entityId &&
    existing?.supplier_party_id === supplierPartyId;
  const preserveVerification =
    mappingUnchanged && upper(existing?.verification_status) === "VERIFIED";
  const now = new Date().toISOString();

  const { error: suspendError } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .update({
      status: "SUSPENDED",
      updated_at: now,
    })
    .eq("provider_id", providerId)
    .eq("status", "ACTIVE")
    .neq("payer_organization_id", payerOrganizationId);

  if (suspendError) throw suspendError;

  const { data, error } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .upsert(
      {
        provider_id: providerId,
        payer_organization_id: payerOrganizationId,
        payer_entity_id: entityId,
        supplier_party_id: supplierPartyId,
        billing_mode: upper(billing_mode) || "SUPPLIER_INVOICE_OR_CHARGE",
        status: preserveVerification ? "ACTIVE" : "BLOCKED",
        currency: upper(currency) || entity.currency || null,
        verification_status: preserveVerification ? "VERIFIED" : "UNVERIFIED",
        verification_method: preserveVerification ? existing.verification_method : null,
        verification_reference: preserveVerification ? existing.verification_reference : null,
        verified_at: preserveVerification ? existing.verified_at : null,
        verified_by: preserveVerification ? existing.verified_by : null,
        configuration: configuration || {},
        metadata: {
          ...(metadata || {}),
          billing_operator: "AVANTIQO",
          operator_organization_id: await resolveOperatorOrganizationId(),
          customer_direct_provider_billing_allowed: false,
          customer_provider_payment_method_allowed: false,
          commercial_verification_required: true,
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

async function verify({
  provider_id,
  payer_organization_id = null,
  verification_method,
  verification_reference,
  verified_by = null,
} = {}) {
  const providerId = text(provider_id).toLowerCase();
  const payerOrganizationId = text(payer_organization_id) || null;
  const method = upper(verification_method);
  const reference = text(verification_reference);

  if (!providerId) throw new Error("provider_id required");
  if (!VERIFICATION_METHODS.has(method)) {
    throw new Error("AVANTIQO_PROVIDER_VERIFICATION_METHOD_INVALID");
  }
  if (!reference) {
    throw new Error("AVANTIQO_PROVIDER_VERIFICATION_REFERENCE_REQUIRED");
  }

  const data = await snapshot({ payerOrganizationId });
  const candidates = data.accounts
    .filter((row) => row.provider_id === providerId && upper(row.status) !== "SUSPENDED")
    .sort((left, right) =>
      String(right.updated_at || "").localeCompare(String(left.updated_at || "")),
    );
  const account = candidates[0] || null;
  if (!account) {
    throw new Error("AVANTIQO_PROVIDER_SUPPLIER_ACCOUNT_REQUIRED");
  }

  const mapping = mappingStatus({
    account,
    payerOrganization: account.payer_organization,
    entity: account.payer_entity,
    supplierProfile: account.supplier_profile,
  });
  if (!mapping.ready) {
    throw new Error(mapping.blocker || "AVANTIQO_PROVIDER_SUPPLIER_MAPPING_INVALID");
  }

  const now = new Date().toISOString();
  const { error: suspendError } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .update({ status: "SUSPENDED", updated_at: now })
    .eq("provider_id", providerId)
    .eq("status", "ACTIVE")
    .neq("id", account.id);

  if (suspendError) throw suspendError;

  const { data: verified, error } = await supabaseAdmin
    .from(ACCOUNT_TABLE)
    .update({
      status: "ACTIVE",
      verification_status: "VERIFIED",
      verification_method: method,
      verification_reference: reference,
      verified_at: now,
      verified_by: text(verified_by) || null,
      updated_at: now,
      metadata: {
        ...(account.metadata || {}),
        commercial_verification_required: true,
        commercial_verification_completed: true,
      },
    })
    .eq("id", account.id)
    .select()
    .single();

  if (error) throw error;
  return verified;
}

export const ProviderSupplierAccountRuntime = {
  resolveOperatorOrganizationId,
  snapshot,
  providerStatus,
  save,
  verify,
};
