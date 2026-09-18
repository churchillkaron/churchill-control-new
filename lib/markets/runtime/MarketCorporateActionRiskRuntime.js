import { evaluateCorporateActionRisk } from "@/lib/markets/runtime/MarketCorporateActionRiskModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

export async function evaluateMarketCorporateActionRisk({
  organizationId,
  portfolioId,
  symbol,
  policy = {},
  side,
  now = new Date(),
}) {
  const ticker = clean(symbol).toUpperCase();
  if (!ticker) {
    return evaluateCorporateActionRisk({
      policy,
      corporateActions: [],
      side,
      now,
    });
  }

  const beforeDays = Math.max(0, Number(policy.corporate_action_blackout_days_before ?? 3));
  const afterDays = Math.max(0, Number(policy.corporate_action_blackout_days_after ?? 1));
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - afterDays - 2);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + beforeDays + 2);

  const { data, error } = await supabaseAdmin
    .from("market_corporate_actions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", ticker)
    .gte("event_date", start.toISOString().slice(0, 10))
    .lte("event_date", end.toISOString().slice(0, 10))
    .order("event_date", { ascending: true });
  if (error) throw error;

  return evaluateCorporateActionRisk({
    policy,
    corporateActions: data || [],
    side,
    now,
  });
}

export const MarketCorporateActionRiskRuntime = {
  evaluate: evaluateMarketCorporateActionRisk,
};
