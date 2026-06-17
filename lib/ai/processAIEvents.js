/**
 * AI EVENT REACTION ENGINE
 * Turns AI-generated system_events into real system behavior
 */

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function processAIEvents({ organizationId }) {
  try {
    // 1. Fetch unprocessed AI events
    const { data: events } = await supabaseAdmin
      .from("system_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("processed", false)
      .order("created_at", { ascending: true });

    if (!events || !events.length) {
      return { success: true, processed: 0 };
    }

    const results = [];

    for (const event of events) {

      // =========================
      // INVENTORY ALERT
      // =========================
      if (event.type === "AI_INVENTORY_ALERT") {
        await supabaseAdmin
          .from("notifications")
          .insert({
            organization_id: organizationId,
            type: "inventory_alert",
            title: "AI detected inventory risk",
            message: "Stock levels require immediate attention",
            severity: event.severity,
          });

        await supabaseAdmin
          .from("ingredients")
          .update({ flagged: true })
          .eq("organization_id", organizationId);
      }

      // =========================
      // PAYROLL REVIEW
      // =========================
      if (event.type === "AI_PAYROLL_REVIEW") {
        await supabaseAdmin
          .from("notifications")
          .insert({
            organization_id: organizationId,
            type: "payroll_alert",
            title: "AI flagged payroll anomaly",
            message: "Payroll requires manual review",
            severity: event.severity,
          });
      }

      // =========================
      // REVENUE INVESTIGATION
      // =========================
      if (event.type === "AI_REVENUE_INVESTIGATION") {
        await supabaseAdmin
          .from("notifications")
          .insert({
            organization_id: organizationId,
            type: "revenue_alert",
            title: "AI detected revenue anomaly",
            message: "Revenue pattern deviation detected",
            severity: event.severity,
          });
      }

      // =========================
      // MARK EVENT AS PROCESSED
      // =========================
      await supabaseAdmin
        .from("system_events")
        .update({ processed: true })
        .eq("id", event.id);

      results.push({
        event: event.type,
        status: "processed",
      });
    }

    return {
      success: true,
      processed: results.length,
      results,
    };

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}
