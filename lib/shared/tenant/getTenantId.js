export function getTenantId(request) {
  const tenantId =
    request.cookies.get("tenant_id")?.value;

  if (!tenantId) {
    throw new Error("Missing tenant context");
  }

  return tenantId;
}