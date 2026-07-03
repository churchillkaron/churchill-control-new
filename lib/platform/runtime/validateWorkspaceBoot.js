export function validateWorkspaceBoot(context = {}) {
  if (!context.organizationId && !context.organization_id) {
    return false;
  }

  if (!context.role) {
    return false;
  }

  return true;
}
