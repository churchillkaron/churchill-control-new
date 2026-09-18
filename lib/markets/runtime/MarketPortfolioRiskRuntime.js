import {
  evaluateHistoricalPortfolioRisk,
  evaluatePortfolioConcentration,
  evaluatePortfolioStressRisk,
  returnsFromBars,
} from "@/lib/markets/runtime/MarketPortfolioRiskModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

export async function evaluateMarketPortfolioRisk({
  organizationId,
  portfolioId,
  policy = {},
  equity,
  positions = [],
  proposed = {},
}) {
  const symbols = [...new Set([
    ...positions.map((row) => clean(row.symbol).toUpperCase()),
    clean(proposed.symbol).toUpperCase(),
  ].filter(Boolean))];

  if (!symbols.length) {
    return {
      approved: true,
      reasons: [],
      metrics: {},
    };
  }

  const [instrumentsResult, barsResult] = await Promise.all([
    supabaseAdmin
      .from("market_instruments")
      .select("symbol,sector,industry")
      .eq("organization_id", organizationId)
      .in("symbol", symbols),
    supabaseAdmin
      .from("market_bars")
      .select("symbol,bar_time,close")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("timeframe", "1Day")
      .in("symbol", symbols)
      .order("bar_time", { ascending: true }),
  ]);

  if (instrumentsResult.error) throw instrumentsResult.error;
  if (barsResult.error) throw barsResult.error;

  const sectorBySymbol = {};
  for (const row of instrumentsResult.data || []) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!symbol) continue;
    sectorBySymbol[symbol] = clean(row.sector) || "UNKNOWN";
  }

  const barsBySymbol = new Map();
  for (const row of barsResult.data || []) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!symbol) continue;
    const current = barsBySymbol.get(symbol) || [];
    current.push(row);
    barsBySymbol.set(symbol, current);
  }

  const returnsBySymbol = {};
  for (const symbol of symbols) {
    returnsBySymbol[symbol] = returnsFromBars(barsBySymbol.get(symbol) || []);
  }

  const concentration = evaluatePortfolioConcentration({
    policy,
    equity,
    positions,
    proposed,
    sectorBySymbol,
    returnsBySymbol,
  });
  const historicalRisk = evaluateHistoricalPortfolioRisk({
    policy,
    equity,
    positions,
    proposed,
    returnsBySymbol,
  });
  const stressRisk = evaluatePortfolioStressRisk({
    policy,
    equity,
    positions,
    proposed,
    sectorBySymbol,
    returnsBySymbol,
  });

  return {
    approved:
      concentration.approved &&
      historicalRisk.approved &&
      stressRisk.approved,
    reasons: [
      ...(concentration.reasons || []),
      ...(historicalRisk.reasons || []),
      ...(stressRisk.reasons || []),
    ],
    metrics: {
      ...(concentration.metrics || {}),
      historical_risk: historicalRisk.metrics || {},
      stress_risk: stressRisk.metrics || {},
    },
  };
}

export const MarketPortfolioRiskRuntime = {
  evaluate: evaluateMarketPortfolioRisk,
};
