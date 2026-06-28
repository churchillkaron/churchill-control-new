export function resolveFinanceScope({
  organizationId,
  searchParams,
}) {
  const entityId =
    searchParams?.get("entityId") ||
    searchParams?.get("entity_id") ||
    organizationId;

  return {
    organizationId,
    entityId,
  };
}

export function financeQuery({
  organizationId,
  entityId,
  extra = {},
}) {
  const params = new URLSearchParams();

  if (organizationId) {
    params.set("organizationId", organizationId);
    params.set("organization_id", organizationId);
  }

  if (entityId) {
    params.set("entityId", entityId);
    params.set("entity_id", entityId);
  }

  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return params.toString();
}

