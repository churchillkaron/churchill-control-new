/**
 * AVANTIQO BOOT VALIDATION GATE
 * Prevents invalid system state from reaching UI
 */

export function validateWorkspaceBoot(context) {
  if (!context) return false;

  if (!context.tenantId) return false;
  if (!context.organizationId) return false;

  if (!context.industry) return false;
  if (!context.plan) return false;

  return true;
}
