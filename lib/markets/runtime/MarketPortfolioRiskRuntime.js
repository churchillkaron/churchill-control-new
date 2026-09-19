import { evaluateHistoricalDataFreshness } from "@/lib/markets/runtime/MarketHistoricalDataFreshnessModels";
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

async function ensureDailyBarRevision({ organizationId, portfolioId }) {
  const { error } = await supabaseAdmin
    .from("market_daily_bar_revisions")
    .upsert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      revision: 0,
    }, {
      onConflict: "organization_id,portfolio_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

async function readDailyBarRevision({ organizationId, portfolioId }) {
  const { data, error } = await supabaseAdmin
    .from("market_daily_bar_revisions")
    .select("revision,updated_at")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .maybeSingle();
  if (error) throw error;
  return {
    revision: Number(data?.revision || 0),
    updated_at: data?.updated_at || null,
  };
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
  const side = clean(proposed.side).toUpperCase();

  await ensureDailyBarRevision({ organizationId, portfolioId });
  const dailyBarRevisionBefore = await readDailyBarRevision({
    organizationId,
    portfolioId,
  });

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

  const dailyBarRevisionAfter = await readDailyBarRevision({
    organizationId,
    portfolioId,
  });
  const dailyBarStable = (
    dailyBarRevisionBefore.revision === dailyBarRevisionAfter.revision
  );

  if (!dailyBarStable && side === "BUY") {
    return {
      approved: false,
      reasons: ["Daily historical bar dataset changed during portfolio-risk evaluation."],
      metrics: {
        daily_bar_revision: dailyBarRevisionAfter.revision,
        daily_bar_revision_updated_at: dailyBarRevisionAfter.updated_at,
        daily_bar_revision_before: dailyBarRevisionBefore.revision,
        daily_bar_consistency_status: "CHANGED_DURING_EVALUATION",
      },
    };
  }

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

  const historicalDataFreshness = evaluateHistoricalDataFreshness({
    action: proposed.side,
    requiredSymbols: barSymbols,
    barsBySymbol: Object.fromEntries(barsBySymbol.entries()),
    policy,
  });

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
      historicalDataFreshness.approved &&
      concentration.approved &&
      historicalRisk.approved &&
      stressRisk.approved &&
      betaRisk.approved &&
      liquidityCapacity.approved,
    reasons: [
      ...(historicalDataFreshness.reasons || []),
      ...(concentration.reasons || []),
      ...(historicalRisk.reasons || []),
      ...(stressRisk.reasons || []),
      ...(betaRisk.reasons || []),
      ...(liquidityCapacity.reasons || []),
    ],
    metrics: {
      daily_bar_revision: dailyBarRevisionAfter.revision,
      daily_bar_revision_updated_at: dailyBarRevisionAfter.updated_at,
      daily_bar_revision_before: dailyBarRevisionBefore.revision,
      daily_bar_consistency_status: dailyBarStable ? "STABLE" : "CHANGED_DURING_EVALUATION",
      historical_data_freshness: historicalDataFreshness.metrics || {},
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
