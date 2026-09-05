import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

async function resolveAccess(request) {
  const url = new URL(request.url);
  const organizationId = text(
    url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
  );

  if (organizationId) {
    return requirePlatformOperatorWorkspaceAccess({ organizationId });
  }

  return requirePlatformAdminAccess();
}

export async function GET(request) {
  const access = await resolveAccess(request);
  if (!access.success) {
    return Response.json({ success: false, error: access.error }, { status: access.status });
  }

  const servicesQuery = access.isPlatformOperatorWorkspace
    ? supabaseAdmin
        .from("organization_services")
        .select(
          "id,organization_id,service_category_id,service_id,status,managed_by,usage_enabled,billing_enabled,health,default_provider_id,fallback_enabled,last_execution_at,total_requests,total_failures,total_cost,updated_at",
        )
        .eq("organization_id", access.organizationId)
        .order("service_id", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const [
    organizationsResult,
    alertsResult,
    incidentsResult,
    modulesResult,
    servicesResult,
  ] = await Promise.all([
    supabaseAdmin.from("organizations").select("*"),
    supabaseAdmin
      .from("system_alerts")
      .select("id,organization_id,alert_type,severity,title,message,status,created_at,resolved_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("enterprise_security_incidents")
      .select("id,organization_id,incident_type,severity,incident_status,incident_summary,created_at,updated_at,resolved_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin.from("platform_modules").select("*"),
    servicesQuery,
  ]);

  for (const result of [
    organizationsResult,
    alertsResult,
    incidentsResult,
    modulesResult,
    servicesResult,
  ]) {
    if (result.error) {
      return Response.json(
        { success: false, error: result.error.message || "Platform control read failed" },
        { status: 500 },
      );
    }
  }

  const recentActivity = [
    ...(alertsResult.data || []).map((row) => ({
      ...row,
      event_type: row.alert_type || "system_alert",
      title: row.title || row.alert_type || "System alert",
      description: row.message || "Persisted system alert",
    })),
    ...(incidentsResult.data || []).map((row) => ({
      ...row,
      event_type: row.incident_type || "security_incident",
      title: row.incident_type || "Security incident",
      description: row.incident_summary || "Persisted security incident",
      status: row.incident_status || "OPEN",
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.created_at || 0).getTime() -
        new Date(left.created_at || 0).getTime(),
    )
    .slice(0, 100);

  return Response.json({
    success: true,
    operatorOrganizationId: access.isPlatformOperatorWorkspace
      ? access.organizationId
      : null,
    organizations: organizationsResult.data || [],
    recentActivity,
    modules: modulesResult.data || [],
    services: servicesResult.data || [],
    activitySource: "SYSTEM_ALERTS_PLUS_ENTERPRISE_SECURITY_INCIDENTS",
    serviceSource: access.isPlatformOperatorWorkspace
      ? "AVANTIQO_PLATFORM_ORGANIZATION_SERVICES"
      : null,
  });
}
