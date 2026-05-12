export function getTenantId(request) {

  const tenantId =
    request.cookies.get("tenant_id")?.value;

  if (tenantId) {
    return tenantId;
  }

  // TEMP DEV FALLBACK
  return "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

}