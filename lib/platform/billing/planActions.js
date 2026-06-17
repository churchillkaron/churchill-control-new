import { updateOrganizationPlan } from "./planLifecycle";
import { rebuildWorkspaceState } from "@/lib/platform/runtime/saaSReactor";
import { setSystemContext } from "@/lib/platform/tenant/tenantContext";

/**
 * FINAL SAAS PLAN ACTIONS
 */

export async function upgradePlan({
  tenantId,
  organizationId,
  newPlan,
}) {
  const updated = await updateOrganizationPlan({
    organizationId,
    plan: newPlan,
  });

  if (!updated) return null;

  const state = await rebuildWorkspaceState(tenantId);

  if (state?.context) {
    setSystemContext(tenantId, state.context);
  }

  return state;
}
