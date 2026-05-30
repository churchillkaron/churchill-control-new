import {
  loadExecutiveDashboard,
} from "@/lib/dashboard/runtime/loadExecutiveDashboard";

export async function tableSessionClosedWorkflow({
  tenantId,
}) {

  await loadExecutiveDashboard({
    tenantId,
  });

}
