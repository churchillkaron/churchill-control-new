import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {
  const access = await requirePlatformAdminAccess();
  if (!access.success) {
    return Response.json({ success: false, error: access.error }, { status: access.status });
  }

  const [organizationsResult, alertsResult, incidentsResult, modulesResult] = await Promise.all([
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
  ]);

  for (const result of [organizationsResult, alertsResult, incidentsResult, modulesResult]) {
    if (result.error) {
      return Response.json({ success: false, error: result.error.message || "Platform control read failed" }, { status: 500 });
    }
  }

  const recentActivity = [
    ...(alertsResult.data || []).map(row => ({
      ...row,
      event_type: row.alert_type || "system_alert",
      title: row.title || row.alert_type || "System alert",
      description: row.message || "Persisted system alert",
    })),
    ...(incidentsResult.data || []).map(row => ({
      ...row,
      event_type: row.incident_type || "security_incident",
      title: row.incident_type || "Security incident",
      description: row.incident_summary || "Persisted security incident",
      status: row.incident_status || "OPEN",
    })),
  ]
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
    .slice(0, 100);

  return Response.json({
    success: true,
    organizations: organizationsResult.data || [],
    recentActivity,
    modules: modulesResult.data || [],
    activitySource: "SYSTEM_ALERTS_PLUS_ENTERPRISE_SECURITY_INCIDENTS",
  });
}
