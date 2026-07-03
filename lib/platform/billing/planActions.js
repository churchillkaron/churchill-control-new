import { updateOrganizationPlan } from "./planLifecycle";
import { rebuildWorkspaceState } from "@/lib/platform/runtime/saaSReactor";

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
