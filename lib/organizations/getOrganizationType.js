export function getOrganizationType(organization) {
  return organization?.organization_type || "unknown";
}

export function isAccountingFirm(organization) {
  return getOrganizationType(organization) === "accounting_firm";
}

export function isDirectBusiness(organization) {
  return getOrganizationType(organization) === "direct_business";
}

export function isClientCompany(organization) {
  return getOrganizationType(organization) === "client_company";
}
