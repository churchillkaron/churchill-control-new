/**
 * MONTHLY INVOICE GENERATOR
 * Aggregates usage → billing invoice
 */

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function generateMonthlyInvoice(tenantId) {
  const { data: logs } = await supabaseAdmin
    .from("ai_usage_logs")
    .select("*")
    .eq("tenant_id", tenantId);

  const grouped = {};

  for (const log of logs || []) {
    if (!grouped[log.feature]) {
      grouped[log.feature] = {
        totalCost: 0,
        count: 0,
      };
    }

    grouped[log.feature].totalCost += log.cost;
    grouped[log.feature].count += 1;
  }

  const total = Object.values(grouped).reduce(
    (sum, f) => sum + f.totalCost,
    0
  );

  return {
    tenantId,
    breakdown: grouped,
    total,
    status: "pending",
  };
}
