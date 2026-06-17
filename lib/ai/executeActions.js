/**
 * ACTION EXECUTION ENGINE
 * Turns AI suggestions into real system events
 */

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function executeActions({
  actions,
  organizationId,
}) {
  if (!actions || !actions.length) return [];

  const results = [];

  for (const action of actions) {
    try {
      // =========================
      // INVENTORY ALERT
      // =========================
      if (action.type === "INVENTORY_ALERT") {
        const { data } = await supabaseAdmin
          .from("system_events")
          .insert({
            organization_id: organizationId,
            type: "AI_INVENTORY_ALERT",
            severity: action.priority,
            payload: action,
            created_at: new Date().toISOString(),
          });

        results.push({ action, status: "logged" });
      }

      // =========================
      // PAYROLL REVIEW
      // =========================
      if (action.type === "PAYROLL_REVIEW") {
        await supabaseAdmin
          .from("system_events")
          .insert({
            organization_id: organizationId,
            type: "AI_PAYROLL_REVIEW",
            severity: action.priority,
            payload: action,
          });

        results.push({ action, status: "logged" });
      }

      // =========================
      // REVENUE INVESTIGATION
      // =========================
      if (action.type === "REVENUE_INVESTIGATION") {
        await supabaseAdmin
          .from("system_events")
          .insert({
            organization_id: organizationId,
            type: "AI_REVENUE_INVESTIGATION",
            severity: action.priority,
            payload: action,
          });

        results.push({ action, status: "logged" });
      }

      // =========================
      // STAFF REVIEW
      // =========================
      if (action.type === "STAFF_PERFORMANCE_REVIEW") {
        await supabaseAdmin
          .from("system_events")
          .insert({
            organization_id: organizationId,
            type: "AI_STAFF_REVIEW",
            severity: action.priority,
            payload: action,
          });

        results.push({ action, status: "logged" });
      }

    } catch (err) {
      results.push({
        action,
        status: "failed",
        error: err.message,
      });
    }
  }

  return results;
}
