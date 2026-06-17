import { setTenantConfig } from "@/lib/platform/tenant/tenantConfig";

/**
 * STORE ONBOARDING RESULT AS SOURCE OF TRUTH
 */

export function storeOnboardingResult(tenantId, result) {
  if (!tenantId || !result) return;

  setTenantConfig(tenantId, {
    organization: result.organization,
    modules: result.modules,
    plan: result.plan,
    industry: result.organization?.industry,
  });
}
