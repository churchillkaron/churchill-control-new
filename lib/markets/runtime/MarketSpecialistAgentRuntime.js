import { MarketAgentPerformanceRuntime } from "@/lib/markets/runtime/MarketAgentPerformanceRuntime";
import {
  buildThesisEvidenceRefs,
  evidenceEventIdsFromRefs,
  mergeEvidenceRefs,
  selectSupportingTheses,
} from "@/lib/markets/runtime/MarketDecisionEvidenceModels";
import { classifyMarketRegime } from "@/lib/markets/runtime/MarketRegimeModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  buildFundamentalThesis,
  buildNewsThesis,
  buildQuantThesis,
  buildTechnicalThesis,
  probabilityUpFromDecision,
  synthesizeMarketDecision,
} from "@/lib/markets/runtime/MarketSpecialistModels";

export {
  buildFundamentalThesis,
  buildNewsThesis,
  buildQuantThesis,
  buildTechnicalThesis,
  probabilityUpFromDecision,
  synthesizeMarketDecision,
} from "@/lib/markets/runtime/MarketSpecialistModels";

export async function persistMarketIntelligenceCycle({
  organizationId,
  portfolioId,
  symbol,
  bars,
  evidence,
  filings,
  fundamentals = [],
  snapshot = null,
  modelVersion = "markets-v1-deterministic",
}) {
  const theses = [
    buildTechnicalThesis({ symbol, bars }),
    buildQuantThesis({ symbol, bars }),
    buildNewsThesis({ symbol, evidence }),
    buildFundamentalThesis({ symbol, filings, fundamentals }),
  ];

  const rows = theses.map((thesis) => {
    const evidenceRefs = buildThesisEvidenceRefs({
      agentType: thesis.agent_type,
      symbol,
      bars,
      evidence,
      filings,
      fundamentals,
      snapshot,
    });
    return {
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol,
      agent_type: thesis.agent_type,
      horizon: thesis.horizon,
      stance: thesis.stance,
      confidence: thesis.confidence,
      expected_return: thesis.expected_return,
      downside_risk: thesis.downside_risk,
      evidence_ids: evidenceEventIdsFromRefs(evidenceRefs),
      evidence_refs: evidenceRefs,
      rationale: thesis.rationale || {},
      model_version: modelVersion,
      generated_at: new Date().toISOString(),
    };
  });

  const { data: persistedTheses, error: thesisError } = await supabaseAdmin
    .from("market_agent_theses")
    .insert(rows)
    .select("*");
  if (thesisError) throw thesisError;

  const [agentWeights, portfolioResult] = await Promise.all([
    MarketAgentPerformanceRuntime.loadWeights({
      organizationId,
      portfolioId,
    }),
    supabaseAdmin
      .from("market_portfolios")
      .select("benchmark_symbol")
      .eq("organization_id", organizationId)
      .eq("id", portfolioId)
      .maybeSingle(),
  ]);
  if (portfolioResult.error) throw portfolioResult.error;

  const benchmarkSymbol = String(
    portfolioResult.data?.benchmark_symbol || "",
  ).trim().toUpperCase();
  let benchmarkBars = [];
  if (benchmarkSymbol) {
    const { data, error } = await supabaseAdmin
      .from("market_bars")
      .select("symbol,bar_time,close")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", benchmarkSymbol)
      .eq("timeframe", "1Day")
      .order("bar_time", { ascending: true })
      .limit(250);
    if (error) throw error;
    benchmarkBars = data || [];
  }

  const marketRegime = classifyMarketRegime({
    bars: benchmarkBars,
  });

  const decision = synthesizeMarketDecision({
    symbol,
    theses: persistedTheses || rows,
    horizon: "MEDIUM",
    agentWeights,
    marketRegime,
  });

  const referencePrice = [
    snapshot?.latest_trade_price,
    snapshot?.minute_close,
    snapshot?.day_close,
  ]
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0) || null;
  const referenceTime = snapshot?.captured_at || new Date().toISOString();
  const probabilityUp = probabilityUpFromDecision({
    action: decision.action,
    confidence: decision.confidence,
  });
  const expiresAt = new Date(new Date(referenceTime).getTime() + (6 * 60 * 60 * 1000)).toISOString();

  const supportingTheses = selectSupportingTheses({
    theses: persistedTheses || rows,
    specialistAgents: decision.decision_payload?.specialist_agents || [],
  });
  const decisionEvidenceRefs = mergeEvidenceRefs(
    ...supportingTheses.map((row) => row.evidence_refs || []),
  );
  const decisionEvidenceIds = evidenceEventIdsFromRefs(decisionEvidenceRefs);

  const { data: persistedDecision, error: decisionError } = await supabaseAdmin
    .from("market_decisions")
    .insert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol,
      horizon: decision.horizon,
      action: decision.action,
      confidence: decision.confidence,
      expected_return: decision.expected_return,
      downside_risk: decision.downside_risk,
      reference_price: referencePrice,
      reference_time: referenceTime,
      probability_up: probabilityUp,
      evidence_ids: decisionEvidenceIds,
      evidence_refs: decisionEvidenceRefs,
      thesis_ids: supportingTheses.map((row) => row.id).filter(Boolean),
      risk_status: "PENDING",
      risk_reasons: [],
      expires_at: expiresAt,
      decision_payload: {
        ...(decision.decision_payload || {}),
        evaluation_horizon_days: 5,
        reference_source: snapshot?.id ? "market_snapshot" : "decision_time",
        reference_snapshot_id: snapshot?.id || null,
      },
    })
    .select("*")
    .single();
  if (decisionError) throw decisionError;

  return { theses: persistedTheses || [], decision: persistedDecision };
}

export const MarketSpecialistAgentRuntime = {
  technical: buildTechnicalThesis,
  quant: buildQuantThesis,
  news: buildNewsThesis,
  fundamental: buildFundamentalThesis,
  synthesize: synthesizeMarketDecision,
  persistCycle: persistMarketIntelligenceCycle,
};
