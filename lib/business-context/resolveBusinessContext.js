import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

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

  const runtime = {
    organization: access.organization,
    access,
    organizationTree: null,
    modules: [],
  };
  const finance = runtime?.finance || {};

  let entity =
    finance.entity ||
    finance.activeEntity ||
    runtime.activeEntity ||
    null;

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

  let period =
    finance.currentPeriod ||
    runtime.activePeriod ||
    null;

  if (periodId) {
    let periodQuery = supabaseAdmin
      .from("accounting_periods")
      .select(`
        id,
        organization_id,
        entity_id,
        name,
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

    period = resolvedPeriod;
  }

  return {
    success: true,
    user: access.user || null,
    organization: access.organization,
    organizationId: access.organizationId,
    entity,
    entityId: entity?.id || null,
    period,
    periodId: period?.id || null,
    country:
      entity?.country ||
      access.organization?.country ||
      finance.accountingProfile?.tax_regime ||
      null,
    currency:
      entity?.currency ||
      finance.baseCurrency ||
      access.organization?.default_currency ||
      null,
    locale:
      entity?.locale ||
      access.organization?.locale ||
      null,
    timezone:
      entity?.timezone ||
      access.organization?.timezone ||
      null,
    permissions: access.permissions || [],
    role: access.role || null,
    workspace: null,
    registry: null,
    runtime,
    finance,
  };
}
