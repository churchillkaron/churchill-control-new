import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function resolveBusinessContext({
  organizationId,
  entityId = null,
  periodId = null,
} = {}) {
  if (!organizationId) {
    return {
      success: false,
      status: 400,
      error: "organizationId required",
    };
  }

  const access =
    await requireOrganizationAccess({
      organizationId,
    });

  if (!access.success) {
    return access;
  }

  const runtime = {
    organization:
      access.organization,

    access,

    organizationTree:
      null,

    modules:
      [],

  };

  const finance =
    runtime?.finance || {};

  const entity =
    entityId
      ? {
          id:
            entityId,
        }
      : (
          finance.entity ||
          finance.activeEntity ||
          runtime.activeEntity ||
          null
        );

  const period =
    periodId
      ? {
          id:
            periodId,
        }
      : (
          finance.currentPeriod ||
          runtime.activePeriod ||
          null
        );

  return {
    success: true,

    user:
      access.user || null,

    organization:
      access.organization,

    organizationId:
      access.organization.id,

    entity,
    entityId:
      entity?.id || null,

    period,
    periodId:
      period?.id || null,

    country:
      entity?.country ||
      access.organization.country ||
      finance.accountingProfile?.tax_regime ||
      null,

    currency:
      entity?.currency ||
      finance.baseCurrency ||
      access.organization.default_currency ||
      "THB",

    permissions:
      access.permissions || [],

    role:
      access.role || null,

    workspace:
      null,

    registry:
      null,

    runtime,
    finance,
  };
}
