import { createOrganization } from "@/lib/platform/administration/runtime/AdministrationRuntime";
import { buildWorkspaceFromTemplate } from "@/lib/onboarding/buildWorkspaceFromTemplate";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";
import { applyTaxSetup } from "@/lib/finance/tax/workflows/applyTaxSetup";
import createLegalEntity from "@/lib/finance/legal-entities/createLegalEntity";
import { createAccountingPeriod } from "@/lib/finance/createAccountingPeriod";

function makeEntityCode(name, organizationId) {
  const prefix =
    String(name || "ENTITY")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 4) || "ENT";

  const suffix =
    String(organizationId || "")
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

export async function provisionOrganization(payload) {
  const name = payload?.organization?.name;
  const industry = payload?.organization?.industry || null;
  const ownerEmail = payload?.owner?.email || null;
  const modules = payload?.modules || [];
  const tenantId = payload?.tenantId;

  const organization = await createOrganization({
    name,
    organizationType:
      payload?.organization?.organizationType || "client_company",
    industry,
    tenantId,
  });

  if (!organization?.id) {
    return {
      success: false,
      error: "Organization creation failed",
    };
  }

  const taxSetup =
    await applyTaxSetup({
      organizationId: organization.id,
      taxRegime:
        payload?.finance?.taxRegime || "THAILAND",
      accountingStandard:
        payload?.finance?.accountingStandard || "TFRS",
      accountingMode:
        payload?.finance?.accountingMode || "operational_entity",
    });

  if (!taxSetup.success) {
    return taxSetup;
  }

  const legalEntityResult =
    await createLegalEntity({
      organization_id: organization.id,
      code:
        payload?.finance?.entityCode ||
        makeEntityCode(name, organization.id),
      legal_name:
        payload?.finance?.legalName || name,
      display_name:
        payload?.finance?.displayName || name,
      country:
        payload?.finance?.country || "Thailand",
      currency:
        payload?.finance?.currency || "THB",
      is_holding_company:
        payload?.finance?.isHoldingCompany || false,
      is_default_accounting_entity: true,
    });

  if (!legalEntityResult.success) {
    return legalEntityResult;
  }

  const entity =
    legalEntityResult.entity;

  const dates = getYearDates();

  const { data: existingPeriod } =
    await supabaseAdmin
      .from("accounting_periods")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("entity_id", entity.id)
      .eq("fiscal_year", dates.year)
      .eq("period_number", 1)
      .maybeSingle();

  let period = existingPeriod || null;

  if (!period) {
    period =
      await createAccountingPeriod({
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

  const { data: staffAccount } =
    await supabaseAdmin
      .from("staff_accounts")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();

  if (staffAccount?.id) {
    await supabaseAdmin
      .from("organization_users")
      .insert({
        organization_id: organization.id,
        staff_account_id: staffAccount.id,
        role: "OWNER",
        status: "active",
      });

    await supabaseAdmin
      .from("staff_accounts")
      .update({
        active_organization_id: organization.id,
      })
      .eq("id", staffAccount.id);
  }

  const availableModules =
    await getAvailableModules({
      organizationId: organization.id,
      industry,
    });

  const moduleRows =
    (availableModules || []).map((m) => ({
      organization_id: organization.id,
      module_key: m.key,
      enabled: true,
    }));

  if (moduleRows.length) {
    await supabaseAdmin
      .from("organization_modules")
      .insert(moduleRows);
  }

  const workspace =
    await buildWorkspaceFromTemplate({
      organizationId: organization.id,
      industry,
      installedBy: ownerEmail || "system",
    });

  return {
    success: true,
    organization,
    finance: {
      accountingProfile: taxSetup.profile,
      entity,
      period,
    },
    modules,
    workspace,
  };
}
