/**
 * BusinessContext architecture
 * Onboarding no longer populates tenant runtime caches.
 */

export function storeOnboardingResult(
  organizationId,
  result,
) {
  return {
    organizationId,
    result,
  };
}
