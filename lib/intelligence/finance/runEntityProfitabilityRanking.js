import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

export async function runEntityProfitabilityRanking({
  organizationId,
  entityIds = [],
  periodId = null,
  startDate = null,
  endDate = null,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  let query = supabaseAdmin
    .from("legal_entities")
    .select("id, organization_id, legal_name, display_name, currency")
    .eq("organization_id", organizationId)
    .order("legal_name", { ascending: true });

  const requestedIds = [...new Set((entityIds || []).map(String).filter(Boolean))];
  if (requestedIds.length) query = query.in("id", requestedIds);

  const { data: entities, error } = await query;
  if (error) throw error;

  const rows = [];
  for (const entity of entities || []) {
    const result = await getExecutiveKPIs({
      organizationId,
      entityId: entity.id,
      periodId,
      startDate,
      endDate,
    });
    const summary = result.summary || {};
    rows.push({
      entity_id: entity.id,
      entity_name: entity.display_name || entity.legal_name || entity.id,
      currency_code: result.currency_code || entity.currency || null,
      revenue: Number(summary.revenue || 0),
      gross_profit: Number(summary.gross_profit || 0),
      net_profit: Number(summary.net_profit || 0),
      gross_profit_margin: summary.gross_profit_margin,
      net_profit_margin: summary.net_profit_margin,
      source: "POSTED_GENERAL_LEDGER",
    });
  }

  rows.sort((left, right) =>
    Number(right.net_profit_margin ?? -Infinity) -
    Number(left.net_profit_margin ?? -Infinity)
  );

  return rows.map((row, index) => ({
    ...row,
    ranking_position: index + 1,
  }));
}
