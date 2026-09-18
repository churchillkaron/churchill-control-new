import { summarizePortfolioPerformance } from "@/lib/markets/runtime/MarketPortfolioPerformanceModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function recordMarketEquitySnapshot({
  organizationId,
  portfolioId,
  sourceType,
  sourceId = null,
  metadata = {},
  markedPortfolio = null,
}) {
  const [accountResult, positionsResult, portfolioResult] = await Promise.all([
    supabaseAdmin
      .from("market_paper_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .maybeSingle(),
    supabaseAdmin
      .from("market_paper_positions")
      .select("market_value,realized_pnl,unrealized_pnl")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId),
    supabaseAdmin
      .from("market_portfolios")
      .select("benchmark_symbol")
      .eq("organization_id", organizationId)
      .eq("id", portfolioId)
      .maybeSingle(),
  ]);

  if (accountResult.error) throw accountResult.error;
  if (positionsResult.error) throw positionsResult.error;
  if (portfolioResult.error) throw portfolioResult.error;

  const account = accountResult.data;
  if (!account) throw new Error("MARKETS_PAPER_ACCOUNT_REQUIRED");

  const positions = positionsResult.data || [];
  const positionsValue = Array.isArray(markedPortfolio?.positions)
    ? markedPortfolio.positions.reduce(
        (sum, row) => sum + number(row.market_value, 0),
        0,
      )
    : positions.reduce(
        (sum, row) => sum + number(row.market_value, 0),
        0,
      );
  const realizedPnl = number(account.realized_pnl, positions.reduce(
    (sum, row) => sum + number(row.realized_pnl, 0),
    0,
  ));
  const unrealizedPnl = number(account.unrealized_pnl, positions.reduce(
    (sum, row) => sum + number(row.unrealized_pnl, 0),
    0,
  ));
  const cashBalance = number(account.cash_balance, 0);
  const equity = cashBalance + positionsValue;
  const highWater = Math.max(number(account.high_water_equity, equity), equity);

  const row = {
    organization_id: organizationId,
    portfolio_id: portfolioId,
    source_type: String(sourceType || "MARK").toUpperCase(),
    source_id: sourceId || null,
    cash_balance: cashBalance,
    positions_value: positionsValue,
    equity,
    realized_pnl: realizedPnl,
    unrealized_pnl: unrealizedPnl,
    high_water_equity: highWater,
    benchmark_symbol: portfolioResult.data?.benchmark_symbol || "SPY",
    metadata: {
      ...metadata,
      authority_effect: "NONE",
      simulation_only: true,
    },
  };

  if (sourceId) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("market_portfolio_equity_snapshots")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("source_type", row.source_type)
      .eq("source_id", sourceId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;
  }

  const { data, error } = await supabaseAdmin
    .from("market_portfolio_equity_snapshots")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    if (sourceId && String(error.code || "") === "23505") {
      const { data: existing, error: retryError } = await supabaseAdmin
        .from("market_portfolio_equity_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("portfolio_id", portfolioId)
        .eq("source_type", row.source_type)
        .eq("source_id", sourceId)
        .maybeSingle();
      if (retryError) throw retryError;
      if (existing) return existing;
    }
    throw error;
  }

  return data;
}

export async function loadMarketPortfolioPerformance({
  organizationId,
  portfolioId,
  limit = 1500,
}) {
  const { data: snapshots, error } = await supabaseAdmin
    .from("market_portfolio_equity_snapshots")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .order("recorded_at", { ascending: true })
    .limit(Math.max(20, Math.min(Number(limit) || 1500, 5000)));
  if (error) throw error;

  return {
    snapshots: snapshots || [],
    summary: summarizePortfolioPerformance({
      snapshots: snapshots || [],
      riskFreeRateAnnual: 0,
    }),
  };
}

export const MarketPortfolioPerformanceRuntime = {
  recordSnapshot: recordMarketEquitySnapshot,
  load: loadMarketPortfolioPerformance,
};
