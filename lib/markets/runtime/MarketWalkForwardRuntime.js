import { simulateWalkForward } from "@/lib/markets/runtime/MarketWalkForwardModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function runMarketWalkForwardBacktest({
  organizationId,
  portfolioId,
  symbol,
  trainingBars = 80,
  testBars = 20,
  transactionCostBps = 10,
  initialEquity = 100000,
}) {
  const ticker = clean(symbol).toUpperCase();
  if (!organizationId || !portfolioId || !ticker) {
    throw new Error("organizationId, portfolioId and symbol are required");
  }

  const config = {
    training_bars: Math.max(20, Math.floor(number(trainingBars, 80))),
    test_bars: Math.max(1, Math.floor(number(testBars, 20))),
    transaction_cost_bps: Math.max(0, number(transactionCostBps, 10)),
    initial_equity: Math.max(1, number(initialEquity, 100000)),
  };

  const { data: run, error: runError } = await supabaseAdmin
    .from("market_backtest_runs")
    .insert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol: ticker,
      strategy_key: "TECHNICAL_QUANT_V1",
      status: "RUNNING",
      training_bars: config.training_bars,
      test_bars: config.test_bars,
      transaction_cost_bps: config.transaction_cost_bps,
      initial_equity: config.initial_equity,
      config: {
        ...config,
        point_in_time: true,
        execution_rule: "signal_on_prior_close_execute_next_open",
        live_authority_effect: "NONE",
      },
    })
    .select("*")
    .single();
  if (runError) throw runError;

  try {
    const { data: bars, error: barsError } = await supabaseAdmin
      .from("market_bars")
      .select("symbol,bar_time,open,high,low,close,volume,trade_count,vwap")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", ticker)
      .eq("timeframe", "1Day")
      .order("bar_time", { ascending: true })
      .limit(1500);
    if (barsError) throw barsError;

    const result = simulateWalkForward({
      symbol: ticker,
      bars: bars || [],
      trainingBars: config.training_bars,
      testBars: config.test_bars,
      transactionCostBps: config.transaction_cost_bps,
      initialEquity: config.initial_equity,
    });

    if (result.status !== "COMPLETED") {
      const { data: failed, error: failedError } = await supabaseAdmin
        .from("market_backtest_runs")
        .update({
          status: "FAILED",
          summary: result.summary || {},
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id)
        .select("*")
        .single();
      if (failedError) throw failedError;
      return { run: failed, folds: [], result };
    }

    const foldRows = result.folds.map((fold) => ({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      run_id: run.id,
      symbol: ticker,
      fold_index: fold.fold_index,
      train_start: fold.train_start,
      train_end: fold.train_end,
      test_start: fold.test_start,
      test_end: fold.test_end,
      starting_equity: fold.starting_equity,
      ending_equity: fold.ending_equity,
      fold_return: fold.fold_return,
      max_drawdown_pct: fold.max_drawdown_pct,
      trade_count: fold.trade_count,
      directional_hits: fold.directional_hits,
      directional_tests: fold.directional_tests,
      turnover: fold.turnover,
      metrics: {
        decisions: fold.decisions,
        fold_high_water_start: fold.fold_high_water_start,
        point_in_time: true,
      },
    }));

    const { data: folds, error: foldsError } = await supabaseAdmin
      .from("market_backtest_folds")
      .insert(foldRows)
      .select("*");
    if (foldsError) throw foldsError;

    const summary = result.summary;
    const { data: completed, error: completedError } = await supabaseAdmin
      .from("market_backtest_runs")
      .update({
        status: "COMPLETED",
        data_start: summary.data_start,
        data_end: summary.data_end,
        final_equity: summary.final_equity,
        total_return: summary.total_return,
        max_drawdown_pct: summary.max_drawdown_pct,
        trade_count: summary.trade_count,
        directional_hit_rate: summary.directional_hit_rate,
        summary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();
    if (completedError) throw completedError;

    return {
      run: completed,
      folds: folds || [],
      result,
    };
  } catch (error) {
    await supabaseAdmin
      .from("market_backtest_runs")
      .update({
        status: "FAILED",
        summary: {
          error: clean(error?.message || error || "MARKETS_BACKTEST_FAILED").slice(0, 700),
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .catch(() => {});
    throw error;
  }
}

export const MarketWalkForwardRuntime = {
  run: runMarketWalkForwardBacktest,
};
