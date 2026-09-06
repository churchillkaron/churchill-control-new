import { createOrganization } from "@/lib/platform/administration/runtime/AdministrationRuntime";
import { buildWorkspaceFromTemplate } from "@/lib/onboarding/buildWorkspaceFromTemplate";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { applyTaxSetup } from "@/lib/finance/tax/workflows/applyTaxSetup";
import createLegalEntity from "@/lib/finance/legal-entities/createLegalEntity";
import { createAccountingPeriod } from "@/lib/finance/createAccountingPeriod";
import { WalletRuntime } from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";
import { bootstrapOrganizationServices } from "@/lib/platform/service-runtime/services/bootstrap/bootstrapOrganizationServices";

function makeEntityCode(name, organizationId) {
  const prefix =
    String(name || "ENTITY")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || "ENT";

  const suffix = String(organizationId || "")
    .replace(/-/g, "")
    .toUpperCase()
    .slice(0, 8);

  return `${prefix}-${suffix}`;
}

function getYearDates(date = new Date()) {
  const year = date.getFullYear();

  return {
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

async function resolveOwnerAccount({ ownerEmail, authUserId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,email,name,party_id,active_organization_id,auth_user_id,active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .limit(2);

  if (error) {
    throw error;
  }

  const account = (data || [])[0] || null;

  if (!account?.id) {
    throw new Error(
      "Your authenticated Avantiqo account is not linked to an active staff account"
    );
  }

  const accountEmail = String(account.email || "").trim().toLowerCase();

  if (!accountEmail || accountEmail !== ownerEmail) {
    throw new Error(
      "The owner email must match the authenticated Avantiqo account"
    );
  }

  return account;
}

async function ensureOwnerParty({ organizationId, staffAccount, ownerName, ownerEmail, ownerPhone }) {
  let party = null;

  if (staffAccount.party_id) {
    const existingById = await supabaseAdmin
      .from("parties")
      .select("id,organization_id")
      .eq("id", staffAccount.party_id)
      .maybeSingle();

    if (existingById.error) {
      throw existingById.error;
    }

    if (existingById.data?.organization_id === organizationId) {
      party = existingById.data;
    }
  }

  if (!party) {
    const existingByEmail = await supabaseAdmin
      .from("parties")
      .select("id,organization_id")
      .eq("organization_id", organizationId)
      .ilike("email", ownerEmail)
      .maybeSingle();

    if (existingByEmail.error) {
      throw existingByEmail.error;
    }

    party = existingByEmail.data || null;
  }

  if (!party) {
    const inserted = await supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        party_type: "person",
        display_name: ownerName,
        email: ownerEmail,
        phone: ownerPhone || null,
        status: "ACTIVE",
      })
      .select("id,organization_id")
      .single();

    if (inserted.error) {
      throw inserted.error;
    }

    party = inserted.data;
  } else {
    const updated = await supabaseAdmin
      .from("parties")
      .update({
        display_name: ownerName,
        email: ownerEmail,
        phone: ownerPhone || null,
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", party.id);

    if (updated.error) {
      throw updated.error;
    }
  }

  const staffUpdate = await supabaseAdmin
    .from("staff_accounts")
    .update({
      name: ownerName,
      party_id: party.id,
      active_organization_id: organizationId,
    })
    .eq("id", staffAccount.id)
    .eq("auth_user_id", staffAccount.auth_user_id);

  if (staffUpdate.error) {
    throw staffUpdate.error;
  }

  return party;
}

async function ensureOrganizationOwner({ organizationId, staffAccountId }) {
  const existing = await supabaseAdmin
    .from("organization_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffAccountId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data?.id) {
    const updated = await supabaseAdmin
      .from("organization_users")
      .update({ role: "OWNER", status: "active" })
      .eq("id", existing.data.id);

    if (updated.error) {
      throw updated.error;
    }

    return existing.data;
  }

  const inserted = await supabaseAdmin
    .from("organization_users")
    .insert({
      organization_id: organizationId,
      staff_account_id: staffAccountId,
      role: "OWNER",
      status: "active",
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data;
}

async function ensureRestaurantWorkCenters({ organizationId }) {
  const baseline = [
    { name: "Kitchen", code: "KITCHEN", sort_order: 10 },
    { name: "Bar", code: "BAR", sort_order: 20 },
  ];

  const existingResult = await supabaseAdmin
    .from("work_centers")
    .select("code")
    .eq("organization_id", organizationId);

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existingCodes = new Set(
    (existingResult.data || [])
      .map((row) => String(row.code || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const missing = baseline
    .filter((item) => !existingCodes.has(item.code))
    .map((item) => ({
      organization_id: organizationId,
      name: item.name,
      code: item.code,
      active: true,
      lifecycle_status: "active",
      sort_order: item.sort_order,
    }));

  if (!missing.length) {
    return baseline;
  }

  const inserted = await supabaseAdmin
    .from("work_centers")
    .insert(missing)
    .select("id,name,code,active,sort_order,lifecycle_status");

  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data || [];
}

export async function provisionOrganization(payload) {
  const name = required(payload?.organization?.name, "organization name");
  const industry = required(payload?.organization?.industry, "industry");
  const country = required(payload?.organization?.country, "country");
  const ownerEmail = required(payload?.owner?.email, "owner email").toLowerCase();
  const ownerName = required(payload?.owner?.name, "owner name");
  const ownerPhone = String(payload?.owner?.phone || "").trim() || null;
  const authUserId = required(payload?.requestedByAuthUserId, "authenticated user");
  const currency = required(payload?.finance?.currency, "finance currency").toUpperCase();
  const accountingStandard = required(
    payload?.finance?.accountingStandard,
    "accounting standard"
  );
  const taxRegime = required(payload?.finance?.taxRegime, "tax regime");
  const modules = payload?.modules || [];

  const staffAccount = await resolveOwnerAccount({ ownerEmail, authUserId });

  const organization = await createOrganization({
    name,
    organizationType:
      payload?.organization?.organizationType ||
      payload?.organization?.organization_type ||
      "client_company",
    parentOrganizationId:
      payload?.organization?.parentOrganizationId ||
      payload?.organization?.parent_organization_id ||
      null,
    legalName:
      payload?.organization?.legalName || payload?.organization?.legal_name || name,
    industry,
    address: payload?.organization?.address || null,
    country,
  });

  if (!organization?.id) {
    return {
      success: false,
      error: "Organization creation failed",
    };
  }

  const taxSetup = await applyTaxSetup({
    organizationId: organization.id,
    taxRegime,
    accountingStandard,
    accountingMode: payload?.finance?.accountingMode || "operational_entity",
    baseCurrency: currency,
  });

  if (!taxSetup.success) {
    return taxSetup;
  }

  const legalEntityResult = await createLegalEntity({
    organization_id: organization.id,
    code:
      payload?.finance?.entityCode || makeEntityCode(name, organization.id),
    legal_name: payload?.finance?.legalName || name,
    display_name: payload?.finance?.displayName || name,
    country: payload?.finance?.country || country,
    currency,
    phone: ownerPhone,
    email: ownerEmail,
    is_holding_company: payload?.finance?.isHoldingCompany || false,
    is_default_accounting_entity: true,
  });

  if (!legalEntityResult.success) {
    return legalEntityResult;
  }

  const entity = legalEntityResult.entity;

  const wallet = await WalletRuntime.getOrCreate({
    organization_id: organization.id,
    currency: entity.currency || currency,
  });

  const serviceBootstrap = await bootstrapOrganizationServices({
    organization_id: organization.id,
    industry_id: industry || "default",
    managed_by: "avantiqo",
  });

  const dates = getYearDates();

  const { data: existingPeriod, error: periodLookupError } = await supabaseAdmin
    .from("accounting_periods")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("entity_id", entity.id)
    .eq("fiscal_year", dates.year)
    .eq("period_number", 1)
    .maybeSingle();

  if (periodLookupError) {
    throw periodLookupError;
  }

  let period = existingPeriod || null;

  if (!period) {
    period = await createAccountingPeriod({
      organization_id: organization.id,
      entity_id: entity.id,
      fiscal_year: dates.year,
      period_number: 1,
      period_name: `${dates.year}`,
      start_date: dates.startDate,
      end_date: dates.endDate,
      status: "OPEN",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const ownerParty = await ensureOwnerParty({
    organizationId: organization.id,
    staffAccount,
    ownerName,
    ownerEmail,
    ownerPhone,
  });

  await ensureOrganizationOwner({
    organizationId: organization.id,
    staffAccountId: staffAccount.id,
  });

  const restaurantWorkCenters =
    industry === "restaurant"
      ? await ensureRestaurantWorkCenters({ organizationId: organization.id })
      : [];

  const workspace = await buildWorkspaceFromTemplate({
    organizationId: organization.id,
    industry,
    installedBy: ownerEmail,
  });

  return {
    success: true,
    organization,
    owner: {
      staffAccountId: staffAccount.id,
      partyId: ownerParty.id,
      name: ownerName,
      email: ownerEmail,
      phone: ownerPhone,
    },
    finance: {
      accountingProfile: taxSetup.profile,
      entity,
      period,
    },
    billing: {
      wallet,
      policy: "PREPAID",
      provider_billed_to: "AVANTIQO",
      customer_payment_source: "AVANTIQO_PREPAID_WALLET",
      provider_execution_requires_reservation: true,
      services: serviceBootstrap,
    },
    operations: {
      workCenters: restaurantWorkCenters,
    },
    modules,
    workspace,
  };
}
