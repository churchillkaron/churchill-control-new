export function getAccountingMode(organizationId) {
  // Default safe mode for now
  // Later this will come from DB settings per organization

  return "SINGLE_ENTITY";
}
