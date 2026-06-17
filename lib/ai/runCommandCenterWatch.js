import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * COMMAND CENTER AI WATCHER
 * Continuously analyzes system health
 */

export async function runCommandCenterWatch({ organizationId }) {
  try {
    const { data: events } = await supabaseAdmin
      .from("system_events")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!events || !events.length) {
      return { status: "idle", message: "No activity detected" };
    }

    const alerts = [];

    // =========================
    // PATTERN DETECTION
    // =========================

    const revenueIssues = events.filter(e =>
      e.type === "AI_REVENUE_INVESTIGATION"
    );

    if (revenueIssues.length > 2) {
      alerts.push({
        type: "CRITICAL_REVENUE_PATTERN",
        message: "Repeated revenue anomalies detected",
        severity: "high",
      });
    }

    const inventoryIssues = events.filter(e =>
      e.type === "AI_INVENTORY_ALERT"
    );

    if (inventoryIssues.length > 3) {
      alerts.push({
        type: "INVENTORY_SYSTEM_RISK",
        message: "Recurring inventory instability detected",
        severity: "high",
      });
    }

    const payrollIssues = events.filter(e =>
      e.type === "AI_PAYROLL_REVIEW"
    );

    if (payrollIssues.length > 2) {
      alerts.push({
        type: "PAYROLL_SYSTEM_ANOMALY",
        message: "Payroll inconsistencies recurring",
        severity: "critical",
      });
    }

    // =========================
    // SAVE ALERTS
    // =========================

    for (const alert of alerts) {
      await supabaseAdmin.from("notifications").insert({
        organization_id: organizationId,
        type: alert.type,
        title: "COMMAND CENTER ALERT",
        message: alert.message,
        severity: alert.severity,
      });
    }

    return {
      status: "processed",
      alertsGenerated: alerts.length,
      alerts,
    };

  } catch (err) {
    return {
      status: "error",
      error: err.message,
    };
  }
}
