import { evaluateLiquidityCapacity } from "@/lib/markets/runtime/MarketLiquidityCapacityModels";
import {
  evaluateHistoricalPortfolioRisk,
  evaluatePortfolioBetaRisk,
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

  const { data: portfolio, error: portfolioError } = await supabaseAdmin
    .from("market_portfolios")
    .select("benchmark_symbol")
    .eq("organization_id", organizationId)
    .eq("id", portfolioId)
    .maybeSingle();
  if (portfolioError) throw portfolioError;
  const benchmarkSymbol = clean(portfolio?.benchmark_symbol || "SPY").toUpperCase();

  if (!symbols.length) {
    return {
      approved: true,
      reasons: [],
      metrics: {},
    };
  }

  const barSymbols = [...new Set([...symbols, benchmarkSymbol].filter(Boolean))];

  const [instrumentsResult, barsResult] = await Promise.all([
    supabaseAdmin
      .from("market_instruments")
      .select("symbol,sector,industry")
      .eq("organization_id", organizationId)
      .in("symbol", symbols),
    supabaseAdmin
      .from("market_bars")
      .select("symbol,bar_time,close,volume")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("timeframe", "1Day")
      .in("symbol", barSymbols)
      .order("bar_time", { ascending: true }),
  ]);

  if (instrumentsResult.error) throw instrumentsResult.error;
  if (barsResult.error) throw barsResult.error;

  const sectorBySymbol = {};
  const industryBySymbol = {};
  for (const row of instrumentsResult.data || []) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!symbol) continue;
    sectorBySymbol[symbol] = clean(row.sector) || "UNKNOWN";
    industryBySymbol[symbol] = clean(row.industry) || "UNKNOWN";
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
    industryBySymbol,
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
  const benchmarkReturns = returnsFromBars(
    barsBySymbol.get(benchmarkSymbol) || [],
  );
  const betaRisk = evaluatePortfolioBetaRisk({
    policy,
    equity,
    positions,
    proposed,
    returnsBySymbol,
    benchmarkReturns,
    benchmarkSymbol,
  });
  const candidateSymbol = clean(proposed.symbol).toUpperCase();
  const liquidityCapacity = evaluateLiquidityCapacity({
    action: proposed.side,
    positions,
    proposedSymbol: candidateSymbol,
    proposedNotional: proposed.notional,
    bars: barsBySymbol.get(candidateSymbol) || [],
    policy,
  });

  return {
    approved:
      concentration.approved &&
      historicalRisk.approved &&
      stressRisk.approved &&
      betaRisk.approved &&
      liquidityCapacity.approved,
    reasons: [
      ...(concentration.reasons || []),
      ...(historicalRisk.reasons || []),
      ...(stressRisk.reasons || []),
      ...(betaRisk.reasons || []),
      ...(liquidityCapacity.reasons || []),
    ],
    metrics: {
      ...(concentration.metrics || {}),
      historical_risk: historicalRisk.metrics || {},
      stress_risk: stressRisk.metrics || {},
      benchmark_beta: betaRisk.metrics || {},
      liquidity_capacity: liquidityCapacity.metrics || {},
    },
  };
}

export const MarketPortfolioRiskRuntime = {
  evaluate: evaluateMarketPortfolioRisk,
};
