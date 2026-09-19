import {
  deriveAgentReliabilityWeight,
  scoreAgentThesisOutcome,
  summarizeAgentOutcomes,
} from "@/lib/markets/runtime/MarketAgentPerformanceModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

export async function evaluateMarketAgentPerformance({
  organizationId,
  portfolioId,
  outcomes = [],
  recentLimit = 200,
}) {
  const rows = Array.isArray(outcomes) ? outcomes : [];
  if (!rows.length) return { scored: 0, performance: [] };

  let scoredCount = 0;
  for (const outcome of rows) {
    const decisionId = clean(outcome?.decision_id);
    if (!decisionId) continue;

    const { data: decision, error: decisionError } = await supabaseAdmin
      .from("market_decisions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("id", decisionId)
      .maybeSingle();
    if (decisionError) throw decisionError;
    if (!decision) continue;

    const thesisIds = Array.isArray(decision.thesis_ids)
      ? decision.thesis_ids.filter(Boolean)
      : [];
    if (!thesisIds.length) continue;

    const { data: theses, error: thesesError } = await supabaseAdmin
      .from("market_agent_theses")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .in("id", thesisIds);
    if (thesesError) throw thesesError;

    for (const thesis of theses || []) {
      const score = scoreAgentThesisOutcome({ thesis, decision, outcome });
      if (!score?.thesis_id || !score?.agent_type || !score?.prediction_time || !score?.evaluation_time) {
        continue;
      }

      const { error: insertError } = await supabaseAdmin
        .from("market_agent_outcomes")
        .upsert({
          organization_id: organizationId,
          portfolio_id: portfolioId,
          ...score,
        }, {
          onConflict: "decision_id,thesis_id",
          ignoreDuplicates: false,
        });
      if (insertError) throw insertError;
      scoredCount += 1;
    }
  }

  const { data: agentRows, error: agentRowsError } = await supabaseAdmin
    .from("market_agent_outcomes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .order("evaluation_time", { ascending: false })
    .limit(Math.max(20, Math.min(Number(recentLimit) || 200, 2000)));
  if (agentRowsError) throw agentRowsError;

  const grouped = new Map();
  for (const row of agentRows || []) {
    const agentType = clean(row.agent_type).toUpperCase();
    if (!agentType) continue;
    const bucket = grouped.get(agentType) || [];
    bucket.push(row);
    grouped.set(agentType, bucket);
  }

  const performance = [];
  for (const [agentType, evidence] of grouped.entries()) {
    const summary = summarizeAgentOutcomes(evidence);
    const reliabilityWeight = deriveAgentReliabilityWeight(summary);
    const evaluatedThrough = evidence
      .map((row) => row.evaluation_time)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    const { data, error } = await supabaseAdmin
      .from("market_agent_performance")
      .upsert({
        organization_id: organizationId,
        portfolio_id: portfolioId,
        agent_type: agentType,
        sample_count: summary.sample_count,
        directional_tests: summary.directional_tests,
        directional_hit_rate: summary.directional_hit_rate,
        avg_brier: summary.avg_brier,
        avg_log_loss: summary.avg_log_loss,
        avg_signed_return: summary.avg_signed_return,
        reliability_weight: reliabilityWeight,
        evaluated_through: evaluatedThrough,
        metrics: {
          recent_evidence_limit: recentLimit,
          reasoning_influence_only: true,
          authority_effect: "NONE",
        },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "portfolio_id,agent_type",
      })
      .select("*")
      .single();
    if (error) throw error;
    performance.push(data);
  }

  return {
    scored: scoredCount,
    performance,
  };
}

export async function loadMarketAgentWeights({
  organizationId,
  portfolioId,
}) {
  const { data, error } = await supabaseAdmin
    .from("market_agent_performance")
    .select("agent_type,reliability_weight,sample_count,directional_hit_rate,avg_brier,avg_log_loss,avg_signed_return,updated_at")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId);
  if (error) throw error;

  return Object.fromEntries((data || []).map((row) => [
    clean(row.agent_type).toUpperCase(),
    {
      weight: Number(row.reliability_weight || 1),
      sample_count: Number(row.sample_count || 0),
      directional_hit_rate: row.directional_hit_rate == null ? null : Number(row.directional_hit_rate),
      avg_brier: row.avg_brier == null ? null : Number(row.avg_brier),
      avg_log_loss: row.avg_log_loss == null ? null : Number(row.avg_log_loss),
      avg_signed_return: row.avg_signed_return == null ? null : Number(row.avg_signed_return),
      updated_at: row.updated_at || null,
    },
  ]));
}

export const MarketAgentPerformanceRuntime = {
  evaluateOutcomes: evaluateMarketAgentPerformance,
  loadWeights: loadMarketAgentWeights,
};
