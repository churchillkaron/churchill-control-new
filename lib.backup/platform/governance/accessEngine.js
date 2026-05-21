import {
  getDomain,
} from "@/lib/platform/engine/domainEngine";

export function canAccessDomain({

  tenant,

  user,

  domainId,

}) {

  const domain =
    getDomain(
      domainId
    );

  if (!domain)
    return false;

  // SUPER ADMIN

  if (
    user?.role ===
    "SUPER_ADMIN"
  ) {

    return true;

  }

  // INDUSTRY ACCESS

  const tenantIndustry =

    tenant?.industry;

  const allowedIndustries =

    domain.industries || [];

  const industryAllowed =

    allowedIndustries.includes(
      "all"
    ) ||

    allowedIndustries.includes(
      tenantIndustry
    );

  if (!industryAllowed)
    return false;

  // PERMISSIONS

  const userPermissions =

    user?.permissions || [];

  const requiredPermissions =

    domain.permissions || [];

  const hasPermission =

    requiredPermissions.every(
      permission =>

        userPermissions.includes(
          permission
        )
    );

  return hasPermission;

}

export function getAccessibleDomains({

  tenant,

  user,

  domains = [],

}) {

  return domains.filter(
    domain =>

      canAccessDomain({

        tenant,

        user,

        domainId:
          domain.name ||
          domain.id,

      })
  );

}
