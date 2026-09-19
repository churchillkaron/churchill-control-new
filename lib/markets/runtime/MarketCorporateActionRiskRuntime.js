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

  const { error: revisionEnsureError } = await supabaseAdmin
    .from("market_corporate_action_revisions")
    .upsert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol: ticker,
      revision: 0,
    }, {
      onConflict: "organization_id,portfolio_id,symbol",
      ignoreDuplicates: true,
    });
  if (revisionEnsureError) throw revisionEnsureError;

  const revisionQuery = () => supabaseAdmin
    .from("market_corporate_action_revisions")
    .select("revision,updated_at")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", ticker)
    .maybeSingle();

  const revisionBeforeResult = await revisionQuery();
  if (revisionBeforeResult.error) throw revisionBeforeResult.error;

  const actionsResult = await supabaseAdmin
    .from("market_corporate_actions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", ticker)
    .gte("event_date", start.toISOString().slice(0, 10))
    .lte("event_date", end.toISOString().slice(0, 10))
    .order("event_date", { ascending: true });
  if (actionsResult.error) throw actionsResult.error;

  const revisionAfterResult = await revisionQuery();
  if (revisionAfterResult.error) throw revisionAfterResult.error;

  const revisionBefore = Number(revisionBeforeResult.data?.revision || 0);
  const revisionAfter = Number(revisionAfterResult.data?.revision || 0);
  if (revisionBefore !== revisionAfter) {
    return {
      approved: false,
      reasons: ["Corporate-action dataset changed during execution revalidation."],
      metrics: {
        side: clean(side).toUpperCase(),
        coverage_guaranteed: false,
        dataset_revision_before: revisionBefore,
        dataset_revision_after: revisionAfter,
        revision_scope_symbol: ticker,
        consistency_status: "CHANGED_DURING_EVALUATION",
      },
    };
  }

  const result = evaluateCorporateActionRisk({
    policy,
    corporateActions: actionsResult.data || [],
    side,
    now,
  });

  return {
    ...result,
    metrics: {
      ...result.metrics,
      dataset_revision: revisionAfter,
      dataset_revision_updated_at: revisionAfterResult.data?.updated_at || null,
      revision_scope_symbol: ticker,
      consistency_status: "STABLE",
    },
  };
}

export const MarketCorporateActionRiskRuntime = {
  evaluate: evaluateMarketCorporateActionRisk,
};
