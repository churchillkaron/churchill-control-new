import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  buildFundamentalThesis,
  buildNewsThesis,
  buildQuantThesis,
  buildTechnicalThesis,
  synthesizeMarketDecision,
} from "@/lib/markets/runtime/MarketSpecialistModels";

export {
  buildFundamentalThesis,
  buildNewsThesis,
  buildQuantThesis,
  buildTechnicalThesis,
  synthesizeMarketDecision,
} from "@/lib/markets/runtime/MarketSpecialistModels";

export async function persistMarketIntelligenceCycle({
  organizationId,
  portfolioId,
  symbol,
  bars,
  evidence,
  filings,
  modelVersion = "markets-v1-deterministic",
}) {
  const theses = [
    buildTechnicalThesis({ symbol, bars }),
    buildQuantThesis({ symbol, bars }),
    buildNewsThesis({ symbol, evidence }),
    buildFundamentalThesis({ symbol, filings }),
  ];

  const rows = theses.map((thesis) => ({
    organization_id: organizationId,
    portfolio_id: portfolioId,
    symbol,
    agent_type: thesis.agent_type,
    horizon: thesis.horizon,
    stance: thesis.stance,
    confidence: thesis.confidence,
    expected_return: thesis.expected_return,
    downside_risk: thesis.downside_risk,
    evidence_ids: [],
    rationale: thesis.rationale || {},
    model_version: modelVersion,
    generated_at: new Date().toISOString(),
  }));

  const { data: persistedTheses, error: thesisError } = await supabaseAdmin
    .from("market_agent_theses")
    .insert(rows)
    .select("*");
  if (thesisError) throw thesisError;

  const decision = synthesizeMarketDecision({
    symbol,
    theses: persistedTheses || rows,
    horizon: "MEDIUM",
  });

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
      evidence_ids: [],
      thesis_ids: (persistedTheses || []).map((row) => row.id),
      risk_status: "PENDING",
      risk_reasons: [],
      decision_payload: decision.decision_payload || {},
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
