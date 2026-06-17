export function getPostOnboardingRedirect({ organizationId }) {
  return {
    redirectTo: `/dashboard?org=${organizationId}`,
    autoLogin: true
  };
}
