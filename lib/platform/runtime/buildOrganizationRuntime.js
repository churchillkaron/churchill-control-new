import { getOrganizationIndustries } from "@/lib/platform/industries/getOrganizationIndustries";
import { getOrganizationWorkspaceSettings } from "@/lib/platform/workspaces/getOrganizationWorkspaceSettings";
import { buildWorkspaceMetrics } from "@/lib/platform/runtime/buildWorkspaceMetrics";
import { buildHotelMetrics } from "@/lib/hotel/buildHotelMetrics";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function buildOrganizationRuntime({
  organization,
  access,
  organizationTree,
  modules
}) {
  if (!organization) {
    return { success: false, error: "Missing organization" };
  }

  const industryRuntime = await getOrganizationIndustries({
    organizationId: organization.id,
    organization,
  });

  if (!industryRuntime.success) return industryRuntime;

  const dashboards = industryRuntime.runtimes.flatMap(r => r.dashboards || []);
  
  const { data: organizationModules } = await supabaseAdmin
    .from("organization_modules")
    .select("module_id,status")
    .eq("organization_id", organization.id)
    .eq("status", "ACTIVE");

  const workspaceSettings = await getOrganizationWorkspaceSettings({
    organizationId: organization.id,
  });

  const isHotelRuntime =
    industryRuntime.runtimes.some(runtime => runtime?.id === "hotel");

  const metrics =
    isHotelRuntime
      ? (await buildHotelMetrics({ organizationId: organization.id })).metrics || {}
      : await buildWorkspaceMetrics({ tenantId: organization.tenant_id });

  /* =========================
     INTELLIGENCE LAYER (FIX)
     ========================= */

  const resolvedRuntime = {
    industries:
      industryRuntime.runtimes || [],

    modules:
      organizationModules || [],

    settings:
      workspaceSettings || {},

    operations:
      industryRuntime.runtimes?.[0]?.operations || null,
  };

  const revenue = metrics?.revenue?.value || 0;
  const orders = metrics?.orders?.value || 0;

  return {
    success: true,
    activeOrganization: organization,
    visibleOrganizations: [organization],
    organizationTree,
    modules,
    dashboards,
    industries: industryRuntime.industries,
    industryRuntimes: industryRuntime.runtimes,
    organizationType: organization.organization_type,
    tenantId: organization.tenant_id,

    resolvedRuntime,

    metrics,

    briefing: {
      summary:
        revenue > 0
          ? `Today’s revenue is THB ${Number(revenue).toLocaleString()} with ${orders} orders.`
          : "No live revenue activity detected yet.",
    },

    alerts: [
      ...(metrics?.inventoryAlerts?.value > 0
        ? [{ message: `${metrics.inventoryAlerts.value} inventory alerts` }]
        : []),
    ],

    activity: [
      { time: "Live", text: `${orders} orders processed` },
    ],
  };
}
