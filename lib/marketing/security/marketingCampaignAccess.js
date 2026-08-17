function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function permissionsFrom(access = {}) {
  return Array.isArray(access.permissions)
    ? access.permissions.map(normalize).filter(Boolean)
    : [];
}

export function hasMarketingPermission(access = {}, required) {
  const target = normalize(required);
  if (!target) return false;

  return permissionsFrom(access).some((granted) => {
    if (granted === "*" || granted === target) return true;
    if (granted.endsWith(".*")) {
      return target.startsWith(granted.slice(0, -1));
    }
    return false;
  });
}

export function canCreateMarketingCampaign(access = {}) {
  return [
    "marketing.campaign.create",
    "marketing.campaign.manage",
    "marketing.*",
  ].some((permission) => hasMarketingPermission(access, permission));
}

export function canUseMultiOrganizationMarketing(access = {}) {
  return [
    "marketing.multi_organization",
    "marketing.campaign.multi_organization",
    "marketing.campaign.manage",
    "marketing.*",
  ].some((permission) => hasMarketingPermission(access, permission));
}

export function marketingCampaignCapabilities({ access, organizationCount = 0 } = {}) {
  const accessibleOrganizationCount = Math.max(0, Number(organizationCount) || 0);
  const canCreateCampaign = canCreateMarketingCampaign(access);
  const canUseWholeCampaign =
    accessibleOrganizationCount >= 2 && canUseMultiOrganizationMarketing(access);

  return {
    canCreateCampaign,
    canUseWholeCampaign,
    accessibleOrganizationCount,
  };
}
