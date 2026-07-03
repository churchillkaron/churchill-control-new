import { getOrganizationIndustries } from "@/lib/platform/industries/getOrganizationIndustries";
import { getOrganizationWorkspaceSettings } from "@/lib/platform/workspaces/getOrganizationWorkspaceSettings";
import { buildWorkspaceMetrics } from "@/lib/platform/runtime/buildWorkspaceMetrics";
import { buildHotelMetrics } from "@/lib/hotel/buildHotelMetrics";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function loadFinanceRuntime({ organization }) {
  if (!organization?.id) {
    return null;
  }

  const { data: accountingProfile } =
    await supabaseAdmin
      .from("organization_accounting_profiles")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

  const { data: entity } =
    await supabaseAdmin
      .from("legal_entities")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("is_default_accounting_entity", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  const { data: currentPeriod } =
    entity?.id
      ? await supabaseAdmin
          .from("accounting_periods")
          .select("*")
          .eq("organization_id", organization.id)
          .eq("entity_id", entity.id)
          .in("status", ["OPEN", "open"])
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  if (!accountingProfile && !entity) {
    return null;
  }

  return {
    organizationId: organization.id,
    accountingProfile: accountingProfile || null,
    entity: entity || null,
    activeEntity: entity || null,
    defaultLegalEntity: entity || null,
    entityId: entity?.id || null,
    entity_id: entity?.id || null,
    legalEntityId: entity?.id || null,
    legal_entity_id: entity?.id || null,
    currentPeriod: currentPeriod || null,
    periodId: currentPeriod?.id || null,
    period_id: currentPeriod?.id || null,
    accountingMode: accountingProfile?.accounting_mode || null,
    accountingStandard: accountingProfile?.accounting_standard || null,
    taxRegime: accountingProfile?.tax_regime || null,
    baseCurrency:
      accountingProfile?.base_currency ||
      entity?.currency ||
      "THB",
    reportingCurrency:
      accountingProfile?.reporting_currency ||
      entity?.currency ||
      "THB",
    ready: Boolean(entity?.id),
  };
}

export async function buildOrganizationRuntime({
  organization,
  access,
  organizationTree,
  modules,
}) {
  if (!organization) {
    return {
      success: false,
      error: "Missing organization",
    };
  }

  const industryRuntime =
    await getOrganizationIndustries({
      organizationId: organization.id,
      organization,
    });

  if (!industryRuntime.success) {
    return industryRuntime;
  }

  const dashboards =
    industryRuntime.runtimes.flatMap(
      runtime => runtime.dashboards || []
    );

  const { data: organizationModules } =
    await supabaseAdmin
      .from("organization_modules")
      .select("module_id,status")
      .eq("organization_id", organization.id)
      .eq("status", "ACTIVE");

  const workspaceSettings =
    await getOrganizationWorkspaceSettings({
      organizationId: organization.id,
    });

  const finance =
    await loadFinanceRuntime({
      organization,
    });

  const isHotelRuntime =
    industryRuntime.runtimes.some(
      runtime => runtime?.id === "hotel"
    );

  const metrics =
    isHotelRuntime
      ? (await buildHotelMetrics({
          organizationId: organization.id,
        })).metrics || {}
      : await buildWorkspaceMetrics({
              });

  const resolvedRuntime = {
    industries:
      industryRuntime.runtimes || [],

    modules:
      organizationModules || [],

    settings:
      workspaceSettings || {},

    operations:
      industryRuntime.runtimes?.[0]?.operations || null,

    finance,
  };

  const revenue =
    metrics?.revenue?.value || 0;

  const orders =
    metrics?.orders?.value || 0;

  return {
    success: true,

    activeOrganization:
      organization,

    visibleOrganizations:
      [organization],

    organizationTree,
    modules,
    dashboards,

    industries:
      industryRuntime.industries,

    industryRuntimes:
      industryRuntime.runtimes,

    organizationType:
      organization.organization_type,

    finance,
    activeEntity:
      finance?.activeEntity || null,
    activePeriod:
      finance?.currentPeriod || null,

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
        ? [
            {
              message:
                `${metrics.inventoryAlerts.value} inventory alerts`,
            },
          ]
        : []),
    ],

    activity: [
      {
        time: "Live",
        text: `${orders} orders processed`,
      },
    ],
  };
}
