export function getPostOnboardingRedirect({ organizationId }) {
  const normalizedOrganizationId = String(organizationId || "").trim();

  if (!normalizedOrganizationId) {
    throw new Error("organizationId required");
  }

  return {
    redirectTo: `/workspace/${normalizedOrganizationId}`,
    autoLogin: false,
  };
}
