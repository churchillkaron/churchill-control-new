import { MarketAgentPerformanceRuntime } from "@/lib/markets/runtime/MarketAgentPerformanceRuntime";
import {
  scorePredictionOutcome,
  targetEvaluationTime,
} from "@/lib/markets/runtime/MarketPredictionOutcomeModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

export async function evaluateMaturedMarketDecisions({
  organizationId,
  portfolioId,
  now = new Date(),
  limit = 100,
}) {
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  const { data: decisions, error: decisionError } = await supabaseAdmin
    .from("market_decisions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .not("reference_price", "is", null)
    .not("reference_time", "is", null)
    .not("probability_up", "is", null)
    .order("reference_time", { ascending: true })
    .limit(limit);
  if (decisionError) throw decisionError;

  const decisionIds = (decisions || []).map((row) => row.id);
  if (!decisionIds.length) return { evaluated: 0, outcomes: [] };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("market_prediction_outcomes")
    .select("decision_id")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .in("decision_id", decisionIds);
  if (existingError) throw existingError;
  const scored = new Set((existing || []).map((row) => row.decision_id));

  const outcomes = [];
  for (const decision of decisions || []) {
    if (scored.has(decision.id)) continue;

    const targetTime = targetEvaluationTime(decision);
    if (new Date(targetTime).getTime() > new Date(nowIso).getTime()) continue;

    const { data: bar, error: barError } = await supabaseAdmin
      .from("market_bars")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", clean(decision.symbol).toUpperCase())
      .eq("timeframe", "1Day")
      .gte("bar_time", targetTime)
      .order("bar_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (barError) throw barError;
    if (!bar) continue;

    const scoredOutcome = scorePredictionOutcome({
      decision,
      observedPrice: bar.close,
      evaluationTime: bar.bar_time,
    });

    const { data: persisted, error: outcomeError } = await supabaseAdmin
      .from("market_prediction_outcomes")
      .insert({
        organization_id: organizationId,
        portfolio_id: portfolioId,
        decision_id: decision.id,
        ...scoredOutcome,
      })
      .select("*")
      .single();
    if (outcomeError) throw outcomeError;
    outcomes.push(persisted);
  }

  const agentPerformance = outcomes.length
    ? await MarketAgentPerformanceRuntime.evaluateOutcomes({
        organizationId,
        portfolioId,
        outcomes,
      })
    : { scored: 0, performance: [] };

  return {
    evaluated: outcomes.length,
    outcomes,
    agent_performance: agentPerformance,
  };
}

export const MarketPredictionOutcomeRuntime = {
  evaluateMatured: evaluateMaturedMarketDecisions,
};
