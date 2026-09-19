import { MarketAgentPerformanceRuntime } from "@/lib/markets/runtime/MarketAgentPerformanceRuntime";
import {
  applyBenchmarkAttribution,
  benchmarkReturnForInterval,
} from "@/lib/markets/runtime/MarketBenchmarkModels";
import { MarketIntelligenceIngestionRuntime } from "@/lib/markets/runtime/MarketIntelligenceIngestionRuntime";
import {
  scorePredictionOutcome,
  targetEvaluationTime,
} from "@/lib/markets/runtime/MarketPredictionOutcomeModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function isoOffset(value, days) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function loadBenchmarkBars({
  organizationId,
  portfolioId,
  benchmarkSymbol,
  predictionTime,
  evaluationTime,
}) {
  const start = isoOffset(predictionTime, -10);
  const end = isoOffset(evaluationTime, 10);

  async function queryBars() {
    const query = supabaseAdmin
      .from("market_bars")
      .select("symbol,bar_time,close")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", benchmarkSymbol)
      .eq("timeframe", "1Day")
      .order("bar_time", { ascending: true });

    if (start) query.gte("bar_time", start);
    if (end) query.lte("bar_time", end);
    const { data, error } = await query.limit(80);
    if (error) throw error;
    return data || [];
  }

  let bars = await queryBars();
  let interval = benchmarkReturnForInterval({
    bars,
    predictionTime,
    evaluationTime,
  });

  if (!interval.available) {
    try {
      await MarketIntelligenceIngestionRuntime.refreshBenchmarkBars({
        organizationId,
        portfolioId,
        symbol: benchmarkSymbol,
        start,
        end,
        limit: 80,
      });
      bars = await queryBars();
      interval = benchmarkReturnForInterval({
        bars,
        predictionTime,
        evaluationTime,
      });
    } catch (error) {
      return {
        available: false,
        benchmark_return: null,
        reason: clean(error?.message || error || "BENCHMARK_REFRESH_FAILED").slice(0, 500),
        interval,
      };
    }
  }

  return {
    ...interval,
    bars,
  };
}

export async function evaluateMaturedMarketDecisions({
  organizationId,
  portfolioId,
  now = new Date(),
  limit = 100,
}) {
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  const { data: portfolio, error: portfolioError } = await supabaseAdmin
    .from("market_portfolios")
    .select("benchmark_symbol")
    .eq("organization_id", organizationId)
    .eq("id", portfolioId)
    .maybeSingle();
  if (portfolioError) throw portfolioError;
  const benchmarkSymbol = clean(portfolio?.benchmark_symbol || "SPY").toUpperCase();

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

    const benchmarkEvidence = await loadBenchmarkBars({
      organizationId,
      portfolioId,
      benchmarkSymbol,
      predictionTime: scoredOutcome.prediction_time,
      evaluationTime: scoredOutcome.evaluation_time,
    });
    const benchmarkAttribution = benchmarkEvidence.available
      ? applyBenchmarkAttribution({
          realizedReturn: scoredOutcome.realized_return,
          benchmarkReturn: benchmarkEvidence.benchmark_return,
        })
      : { benchmark_return: null, excess_return: null };

    const { data: persisted, error: outcomeError } = await supabaseAdmin
      .from("market_prediction_outcomes")
      .insert({
        organization_id: organizationId,
        portfolio_id: portfolioId,
        decision_id: decision.id,
        ...scoredOutcome,
        ...benchmarkAttribution,
        outcome_payload: {
          ...(scoredOutcome.outcome_payload || {}),
          benchmark_symbol: benchmarkSymbol,
          benchmark_attribution_available: benchmarkEvidence.available,
          benchmark_attribution_reason: benchmarkEvidence.reason || null,
          benchmark_start_time: benchmarkEvidence.start_bar?.bar_time || null,
          benchmark_end_time: benchmarkEvidence.end_bar?.bar_time || null,
        },
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
