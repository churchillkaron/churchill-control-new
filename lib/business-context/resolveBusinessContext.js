import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";
import {
  resolveFinanceOrganizationProfile,
} from "@/lib/finance/organization-profile/FinanceOrganizationProfile";

function withPeriodPresentation(period) {
  if (!period) return null;

  const label = [
    period.start_date,
    period.end_date,
  ].filter(Boolean).join(" – ");

  return {
    ...period,
    name: label || null,
    label: label || null,
  };
}

export async function resolveBusinessContext({
  organizationId,
  entityId = null,
  periodId = null,
  request = null,
  access: suppliedAccess = null,
} = {}) {
  if (!organizationId) {
    return {
      success: false,
      status: 400,
      error: "organizationId required",
    };
  }

  const access = suppliedAccess || await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) {
    return access;
  }

  if (String(access.organizationId) !== String(organizationId)) {
    return {
      success: false,
      status: 403,
      error: "Resolved organisation does not match requested organisation",
    };
  }

  const organizationProfile = await resolveFinanceOrganizationProfile({
    organizationId: access.organizationId,
  });

  const runtime = {
    organization: access.organization,
    access,
    organizationTree: null,
    modules: [],
    finance: {
      organizationProfile,
      accountingProfile: organizationProfile,
      baseCurrency: organizationProfile?.functional_currency || null,
      reportingCurrency: organizationProfile?.reporting_currency || null,
    },
  };
  const finance = runtime.finance;

  let entity = null;

  if (entityId) {
    entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      return {
        success: false,
        status: 404,
        error: "Legal entity not found in organisation",
      };
    }
  }

  let period = null;

  if (periodId) {
    let periodQuery = supabaseAdmin
      .from("accounting_periods")
      .select(`
        id,
        organization_id,
        entity_id,
        start_date,
        end_date,
        status
      `)
      .eq("organization_id", access.organizationId)
      .eq("id", periodId);

    if (entity?.id) {
      periodQuery = periodQuery.or(
        `entity_id.eq.${entity.id},entity_id.is.null`
      );
    }

    const {
      data: resolvedPeriod,
      error: periodError,
    } = await periodQuery.maybeSingle();

    if (periodError) {
      throw periodError;
    }

    if (!resolvedPeriod) {
      return {
        success: false,
        status: 404,
        error: "Accounting period not found in organisation/entity scope",
      };
    }

    period = withPeriodPresentation(resolvedPeriod);
  }

  const organization = {
    ...(access.organization || {}),
    legal_name:
      access.organization?.legal_name ||
      organizationProfile?.legal_name ||
      null,
    name:
      access.organization?.name ||
      organizationProfile?.trading_name ||
      organizationProfile?.legal_name ||
      null,
    country:
      access.organization?.country ||
      organizationProfile?.country_code ||
      null,
    default_currency:
      access.organization?.default_currency ||
      organizationProfile?.functional_currency ||
      null,
    timezone:
      access.organization?.timezone ||
      organizationProfile?.timezone ||
      null,
    locale:
      access.organization?.locale ||
      organizationProfile?.locale ||
      null,
  };

  return {
    success: true,
    user: access.user || null,
    organization,
    organizationProfile,
    organizationId: access.organizationId,
    entity,
    entityId: entity?.id || null,
    period,
    periodId: period?.id || null,
    country:
      entity?.country ||
      organizationProfile?.country_code ||
      organization.country ||
      null,
    currency:
      entity?.currency ||
      organizationProfile?.functional_currency ||
      organization.default_currency ||
      null,
    reportingCurrency:
      organizationProfile?.reporting_currency ||
      organizationProfile?.functional_currency ||
      null,
    locale:
      entity?.locale ||
      organizationProfile?.locale ||
      organization.locale ||
      null,
    timezone:
      entity?.timezone ||
      organizationProfile?.timezone ||
      organization.timezone ||
      null,
    accountingStandard: organizationProfile?.accounting_standard || null,
    fiscalYearStartMonth:
      organizationProfile?.fiscal_year_start_month || null,
    permissions: access.permissions || [],
    role: access.role || null,
    workspace: null,
    registry: null,
    runtime,
    finance,
  };
}
