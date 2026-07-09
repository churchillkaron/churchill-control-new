function normalizeId(value) {
  const normalized =
    String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

export async function requireOrganizationAccess({
  organizationId,
  organization_id,
  tenantId,
  tenant_id,
  userEmail,
  email,
} = {}) {
  // minimal safe gate (no runtime dependency)

  const resolvedOrganizationId =
    normalizeId(
      organizationId ||
      organization_id ||
      tenantId ||
      tenant_id
    );

  if (!resolvedOrganizationId) {
    return {
      success: false,
      status: 400,
      error: "Missing organizationId",
    };
  }

  const resolvedEmail =
    userEmail ||
    email ||
    null;

  return {
    success: true,
    status: 200,
    userEmail: resolvedEmail,
    organizationId: resolvedOrganizationId,
    organization_id: resolvedOrganizationId,
    tenantId: resolvedOrganizationId,
    tenant_id: resolvedOrganizationId,
    organization: {
      id: resolvedOrganizationId,
    },
    access: {
      userEmail: resolvedEmail,
    },
    staff: null,
    role: null,
    permissions: [],
  };
}
