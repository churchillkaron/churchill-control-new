import { updateOrganizationPlan } from "./planLifecycle";

export async function upgradePlan({
  organizationId,
  newPlan,
}) {
  const updated =
    await updateOrganizationPlan({
      organizationId,
      plan: newPlan,
    });

  if (!updated) {
    return null;
  }

  return await rebuildWorkspaceState({
    organizationId,
  });
}
