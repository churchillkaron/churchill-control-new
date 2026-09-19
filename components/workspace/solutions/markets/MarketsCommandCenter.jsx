"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Database,
  Lightbulb,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency = "USD") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(number);
}

function positionAgeDays(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return null;
  return Math.max(0, (Date.now() - time) / (24 * 60 * 60 * 1000));
}

function trailingLevel(position, policy) {
  if (policy?.trailing_stop_enabled === false) return null;
  const entry = Number(position?.average_entry_price || 0);
  const highWater = Number(position?.high_water_price || 0);
  const fixedStop = Number(position?.stop_loss_price || 0);
  const trailingPct = Number(policy?.default_trailing_stop_pct ?? 7.5);
  if (!(entry > 0) || !(highWater > entry) || !(trailingPct > 0)) return null;
  const candidate = highWater * (1 - (trailingPct / 100));
  return candidate > fixedStop ? candidate : null;
}

export default function MarketsCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("");
  const [paperQuantityBySymbol, setPaperQuantityBySymbol] = useState({});
  const [automationDraft, setAutomationDraft] = useState(null);
  const [riskDraft, setRiskDraft] = useState(null);
  const [benchmarkDraft, setBenchmarkDraft] = useState("SPY");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/markets/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.success) throw new Error(json?.error || "Unable to load Markets");
      setData(json);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Markets");
    } finally {
      setLoading(false);
    }
  }, [organizationId, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setBenchmarkDraft(String(data?.portfolio?.benchmark_symbol || "SPY").toUpperCase());
  }, [data?.portfolio?.benchmark_symbol]);

  useEffect(() => {
    const policy = data?.automationPolicy;
    if (!policy) return;
    setAutomationDraft({
      cycle_interval_seconds: String(policy.cycle_interval_seconds ?? 300),
      target_position_pct: String(policy.target_position_pct ?? 2),
      target_annualized_volatility_pct: String(policy.target_annualized_volatility_pct ?? 25),
      min_confidence: String(policy.min_confidence ?? 0.75),
      max_trades_per_cycle: String(policy.max_trades_per_cycle ?? 3),
      cooldown_minutes: String(policy.cooldown_minutes ?? 60),
      require_walk_forward_validation: policy.require_walk_forward_validation !== false,
      validation_max_age_hours: String(policy.validation_max_age_hours ?? 168),
      validation_min_trades: String(policy.validation_min_trades ?? 5),
      validation_min_directional_hit_rate: String(policy.validation_min_directional_hit_rate ?? 0.5),
      validation_max_drawdown_pct: String(policy.validation_max_drawdown_pct ?? 25),
      validation_min_total_return: String(policy.validation_min_total_return ?? 0),
      require_strategy_health_gate: policy.require_strategy_health_gate !== false,
      strategy_health_min_samples: String(policy.strategy_health_min_samples ?? 20),
      strategy_health_max_brier: String(policy.strategy_health_max_brier ?? 0.30),
      strategy_health_max_log_loss: String(policy.strategy_health_max_log_loss ?? 0.90),
      strategy_health_min_directional_hit_rate: String(policy.strategy_health_min_directional_hit_rate ?? 0.45),
      strategy_health_min_avg_excess_return: String(policy.strategy_health_min_avg_excess_return ?? -0.01),
    });
  }, [data?.automationPolicy]);

  useEffect(() => {
    const policy = data?.riskPolicy;
    if (!policy) return;
    setRiskDraft({
      max_position_pct: String(policy.max_position_pct ?? 10),
      max_sector_pct: String(policy.max_sector_pct ?? 30),
      max_industry_pct: String(policy.max_industry_pct ?? 20),
      max_gross_exposure_pct: String(policy.max_gross_exposure_pct ?? 100),
      max_correlated_exposure_pct: String(policy.max_correlated_exposure_pct ?? 35),
      correlation_threshold: String(policy.correlation_threshold ?? 0.8),
      max_daily_loss_pct: String(policy.max_daily_loss_pct ?? 2),
      max_portfolio_drawdown_pct: String(policy.max_portfolio_drawdown_pct ?? 10),
      min_decision_confidence: String(policy.min_decision_confidence ?? 0.7),
      max_order_notional: policy.max_order_notional == null ? "" : String(policy.max_order_notional),
      max_market_data_age_seconds: String(policy.max_market_data_age_seconds ?? 120),
      max_spread_bps: String(policy.max_spread_bps ?? 50),
      min_quote_notional: String(policy.min_quote_notional ?? 0),
      block_corporate_action_buys: policy.block_corporate_action_buys !== false,
      corporate_action_blackout_days_before: String(policy.corporate_action_blackout_days_before ?? 3),
      corporate_action_blackout_days_after: String(policy.corporate_action_blackout_days_after ?? 1),
      protective_exits_enabled: policy.protective_exits_enabled !== false,
      default_stop_loss_pct: String(policy.default_stop_loss_pct ?? 5),
      default_take_profit_pct: String(policy.default_take_profit_pct ?? 10),
      trailing_stop_enabled: policy.trailing_stop_enabled !== false,
      default_trailing_stop_pct: String(policy.default_trailing_stop_pct ?? 7.5),
      time_exit_enabled: policy.time_exit_enabled !== false,
      max_holding_days: String(policy.max_holding_days ?? 30),
      historical_risk_min_observations: String(policy.historical_risk_min_observations ?? 60),
      max_portfolio_var_95_pct: String(policy.max_portfolio_var_95_pct ?? 5),
      max_portfolio_expected_shortfall_95_pct: String(policy.max_portfolio_expected_shortfall_95_pct ?? 8),
      max_position_annualized_volatility_pct: String(policy.max_position_annualized_volatility_pct ?? 100),
      max_portfolio_stress_loss_pct: String(policy.max_portfolio_stress_loss_pct ?? 12),
      stress_market_shock_pct: String(policy.stress_market_shock_pct ?? 8),
      stress_sector_shock_pct: String(policy.stress_sector_shock_pct ?? 12),
      stress_correlated_cluster_shock_pct: String(policy.stress_correlated_cluster_shock_pct ?? 15),
      stress_single_name_shock_pct: String(policy.stress_single_name_shock_pct ?? 20),
      max_rolling_24h_turnover_pct: String(policy.max_rolling_24h_turnover_pct ?? 100),
      max_rolling_24h_execution_cost_pct_equity: String(policy.max_rolling_24h_execution_cost_pct_equity ?? 0.25),
      max_open_positions: String(policy.max_open_positions ?? 20),
      max_consecutive_losing_closes: String(policy.max_consecutive_losing_closes ?? 3),
      loss_streak_cooloff_hours: String(policy.loss_streak_cooloff_hours ?? 24),
      min_cash_reserve_pct: String(policy.min_cash_reserve_pct ?? 10),
      cash_reserve_execution_buffer_bps: String(policy.cash_reserve_execution_buffer_bps ?? 25),
      loss_reentry_cooloff_hours: String(policy.loss_reentry_cooloff_hours ?? 24),
      max_incremental_var_95_pct: String(policy.max_incremental_var_95_pct ?? 1.5),
      max_incremental_expected_shortfall_95_pct: String(policy.max_incremental_expected_shortfall_95_pct ?? 2.5),
      max_portfolio_beta: String(policy.max_portfolio_beta ?? 1.5),
      liquidity_adv_window_days: String(policy.liquidity_adv_window_days ?? 20),
      liquidity_min_observations: String(policy.liquidity_min_observations ?? 15),
      max_position_adv_pct: String(policy.max_position_adv_pct ?? 10),
      liquidation_participation_pct: String(policy.liquidation_participation_pct ?? 10),
      max_days_to_liquidate: String(policy.max_days_to_liquidate ?? 5),
      max_daily_bar_age_hours: String(policy.max_daily_bar_age_hours ?? 120),
    });
  }, [data?.riskPolicy]);

  async function act(action, payload = {}) {
    setWorking(action);
    setError("");
    try {
      const response = await fetch("/api/markets/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId, entityId, action, ...payload }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.success) throw new Error(json?.error || "Markets action failed");
      await load();
      return json;
    } catch (actionError) {
      setError(actionError?.message || "Markets action failed");
      return null;
    } finally {
      setWorking("");
    }
  }

  async function addWatchlist(event) {
    event.preventDefault();
    const next = symbol.trim().toUpperCase();
    if (!next) return;
    const result = await act("ADD_WATCHLIST", { symbol: next, asset_type: "EQUITY" });
    if (result) setSymbol("");
  }

  async function queuePaperDecision(decision) {
    const ticker = String(decision?.symbol || "").toUpperCase();
    const quantity = Number(paperQuantityBySymbol[ticker]);
    if (!(quantity > 0)) {
      setError("Enter a paper quantity greater than zero.");
      return;
    }

    const result = await act("SUBMIT_PAPER_ORDER", {
      decision_id: decision.id,
      quantity,
      order_type: "MARKET",
    });
    if (result) {
      setPaperQuantityBySymbol((current) => ({ ...current, [ticker]: "" }));
    }
  }

  const portfolio = data?.portfolio;
  const watchlist = Array.isArray(data?.watchlist) ? data.watchlist : [];
  const decisions = Array.isArray(data?.decisions) ? data.decisions : [];
  const orders = Array.isArray(data?.paperOrders) ? data.paperOrders : [];
  const evidence = Array.isArray(data?.evidence) ? data.evidence : [];
  const theses = Array.isArray(data?.theses) ? data.theses : [];
  const snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
  const filings = Array.isArray(data?.filings) ? data.filings : [];
  const outcomes = Array.isArray(data?.outcomes) ? data.outcomes : [];
  const paperAccount = data?.paperAccount || null;
  const paperPositions = Array.isArray(data?.paperPositions) ? data.paperPositions : [];
  const paperFills = Array.isArray(data?.paperFills) ? data.paperFills : [];
  const feedStatus = data?.feedStatus || null;
  const automationPolicy = data?.automationPolicy || {};
  const automationRuns = Array.isArray(data?.automationRuns) ? data.automationRuns : [];
  const backtestRuns = Array.isArray(data?.backtestRuns) ? data.backtestRuns : [];
  const agentPerformance = Array.isArray(data?.agentPerformance) ? data.agentPerformance : [];
  const portfolioPerformance = data?.portfolioPerformance?.summary || {};
  const equitySnapshots = Array.isArray(data?.portfolioPerformance?.snapshots)
    ? data.portfolioPerformance.snapshots
    : [];
  const equityChartRows = equitySnapshots.slice(-20);
  const equityChartValues = equityChartRows
    .map((row) => Number(row.equity))
    .filter(Number.isFinite);
  const equityChartMin = equityChartValues.length ? Math.min(...equityChartValues) : null;
  const equityChartMax = equityChartValues.length ? Math.max(...equityChartValues) : null;
  const equityChartRange = equityChartMin != null && equityChartMax != null
    ? Math.max(1, equityChartMax - equityChartMin)
    : 1;
  const executionQuality = data?.executionQuality || {};
  const corporateActions = Array.isArray(data?.corporateActions) ? data.corporateActions : [];
  const corporateActionAdjustments = Array.isArray(data?.corporateActionAdjustments)
    ? data.corporateActionAdjustments
    : [];
  const riskEvents = Array.isArray(data?.riskEvents) ? data.riskEvents : [];
  const openCircuitBreakerEvent = riskEvents.find(
    (row) => row.event_type === "PORTFOLIO_CIRCUIT_BREAKER" && row.status === "OPEN",
  ) || null;
  const corporateActionAdjustmentCounts = corporateActionAdjustments.reduce(
    (counts, row) => {
      const status = String(row?.status || "").toUpperCase();
      if (status === "APPLIED") counts.applied += 1;
      if (status === "UNRESOLVED") counts.unresolved += 1;
      if (status === "SKIPPED") counts.skipped += 1;
      return counts;
    },
    { applied: 0, unresolved: 0, skipped: 0 },
  );
  const policy = data?.riskPolicy || {};
  const latestBacktest = backtestRuns[0] || null;
  const completedBacktests = backtestRuns.filter((row) => row.status === "COMPLETED");
  const latestPortfolioRisk = orders
    .map((row) => row?.risk_snapshot?.portfolio_concentration)
    .find((row) => row && Object.keys(row).length) || null;
  const latestPortfolioRiskBudget = orders
    .map((row) => row?.risk_snapshot?.portfolio_risk_budget)
    .find((row) => row && Object.keys(row).length) || null;
  const latestTradingBudget = orders
    .map((row) => row?.risk_snapshot?.trading_budget_24h)
    .find((row) => row && Object.keys(row).length) || null;
  const latestOpenPositionLimit = orders
    .map((row) => row?.risk_snapshot?.open_position_limit)
    .find((row) => row && Object.keys(row).length) || null;
  const latestLossStreakCooloff = orders
    .map((row) => row?.risk_snapshot?.loss_streak_cooloff)
    .find((row) => row && Object.keys(row).length) || null;
  const latestCashReserve = orders
    .map((row) => row?.risk_snapshot?.cash_reserve)
    .find((row) => row && Object.keys(row).length) || null;
  const latestSymbolLossReentry = orders
    .map((row) => row?.risk_snapshot?.symbol_loss_reentry)
    .find((row) => row && Object.keys(row).length) || null;
  const latestMarketRegime = decisions
    .map((row) => row?.decision_payload?.market_regime)
    .find((row) => row && row.regime) || null;
  const latestStrategyHealth = decisions
    .map((row) => row?.decision_payload?.strategy_health)
    .find((row) => row && row.status) || null;
  const baseCurrency = portfolio?.base_currency || paperAccount?.base_currency || "USD";
  const canExecutePaper = data?.execution?.can_execute_paper === true;
  const openPositions = paperPositions.filter((row) => Number(row.quantity || 0) > 0);
  const portfolioReturnPct = portfolioPerformance.total_return == null
    ? null
    : Number(portfolioPerformance.total_return) * 100;
  const openRiskEvents = riskEvents.filter((row) => row.status === "OPEN").length;
  const liveEvidenceCount = [
    feedStatus?.connection_state === "CONNECTED",
    evidence.length > 0,
    filings.length > 0,
    snapshots.length > 0,
  ].filter(Boolean).length;

  const latestBySymbol = new Map();
  for (const row of decisions) {
    if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
  }
  const latestSnapshotBySymbol = new Map();
  for (const row of snapshots) {
    if (!latestSnapshotBySymbol.has(row.symbol)) latestSnapshotBySymbol.set(row.symbol, row);
  }
  const latestBacktestBySymbol = new Map();
  for (const row of backtestRuns) {
    if (!latestBacktestBySymbol.has(row.symbol)) latestBacktestBySymbol.set(row.symbol, row);
  }

  const directionalOutcomes = outcomes.filter((row) => typeof row.directional_hit === "boolean");
  const directionalHits = directionalOutcomes.filter((row) => row.directional_hit).length;
  const hitRate = directionalOutcomes.length
    ? (directionalHits / directionalOutcomes.length) * 100
    : null;
  const brierRows = outcomes.map((row) => Number(row.squared_error)).filter(Number.isFinite);
  const logLossRows = outcomes.map((row) => Number(row.log_loss)).filter(Number.isFinite);
  const averageBrier = brierRows.length
    ? brierRows.reduce((sum, value) => sum + value, 0) / brierRows.length
    : null;
  const averageLogLoss = logLossRows.length
    ? logLossRows.reduce((sum, value) => sum + value, 0) / logLossRows.length
    : null;
  const benchmarkOutcomes = outcomes.filter(
    (row) => Number.isFinite(Number(row.benchmark_return)) && Number.isFinite(Number(row.excess_return)),
  );
  const averageBenchmarkReturn = benchmarkOutcomes.length
    ? benchmarkOutcomes.reduce((sum, row) => sum + Number(row.benchmark_return), 0) / benchmarkOutcomes.length
    : null;
  const averageExcessReturn = benchmarkOutcomes.length
    ? benchmarkOutcomes.reduce((sum, row) => sum + Number(row.excess_return), 0) / benchmarkOutcomes.length
    : null;
  const benchmarkOutperformanceRate = benchmarkOutcomes.length
    ? (benchmarkOutcomes.filter((row) => Number(row.excess_return) > 0).length / benchmarkOutcomes.length) * 100
    : null;

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#191919]">
        <div className="flex min-h-[420px] items-center justify-center text-sm text-[#6C6963]">
          <LoaderCircle size={18} className="mr-2 animate-spin" /> Loading Avantiqo Markets…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F5EF] p-4 text-[#191919] md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1760px] space-y-5">
        <section id="markets-overview" className="scroll-mt-24 overflow-hidden rounded-[28px] border border-[#CDAA78]/25 bg-[#FFFDF9] shadow-[0_26px_80px_rgba(73,55,35,0.10)]">
          <div className="flex min-h-16 items-center gap-3 border-b border-black/[0.055] px-5 py-3 md:px-6">
            <div className="hidden min-w-[150px] items-center gap-2 lg:flex">
              <div className="h-8 w-8 rounded-full border border-[#B98B54]/30 bg-[radial-gradient(circle_at_30%_30%,#fff_0%,#f8efe2_65%,#ead7bc_100%)] shadow-inner" />
              <span className="text-[11px] font-semibold tracking-[0.34em] text-[#8A6239]">AVANTIQO</span>
            </div>

            <form onSubmit={addWatchlist} className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9B9288]" />
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="Search markets, companies, themes…"
                className="h-10 w-full rounded-xl border border-black/[0.07] bg-white/70 pl-10 pr-4 text-[11px] uppercase text-[#2D2925] outline-none backdrop-blur placeholder:normal-case placeholder:text-[#A49C92] focus:border-[#B98B54]/40"
              />
            </form>

            <div className="hidden items-center gap-2 sm:flex">
              <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#B98B54]/25 bg-[#FBF5EA] px-3 text-[10px] font-semibold text-[#6F4D2B]">
                <TrendingUp size={13} />
                Paper Trading Mode
                <ChevronDown size={12} className="opacity-65" />
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-black/[0.06] bg-white/80 text-[#665F57]" aria-label="Market alerts">
                <Bell size={14} />
              </button>
              <button type="button" onClick={load} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-black/[0.06] bg-white/80 text-[#665F57] disabled:opacity-40" aria-label="Refresh Markets">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.22em] text-[#A37849]">
                  <span>Markets</span>
                  <span className="h-1 w-1 rounded-full bg-[#D8C0A0]" />
                  <span>Governed paper execution</span>
                </div>
                <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.05em] text-[#1F1C19] md:text-[40px]">Markets</h1>
                <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#746C63]">
                  Research, test and operate market decisions with live evidence, deterministic risk controls and auditable paper execution.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 xl:items-end">
                <div className="flex flex-wrap items-center gap-2 text-[9px] text-[#766E65]">
                  <span>Live market data</span>
                  <span className="text-[#C3B8AA]">•</span>
                  <span>Governed execution</span>
                  <span className="text-[#C3B8AA]">•</span>
                  <span>Learn & improve</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1.5 text-[9px] font-medium text-[#5E5850]">
                  <span className={`h-2 w-2 rounded-full ${
                    feedStatus?.connection_state === "CONNECTED"
                      ? "bg-emerald-500"
                      : feedStatus?.connection_state === "DEGRADED" || feedStatus?.connection_state === "CONNECTING"
                        ? "bg-amber-500"
                        : "bg-[#B7B0A7]"
                  }`} />
                  {feedStatus?.connection_state === "CONNECTED" ? "All market systems active" : feedStatus?.connection_state || "Market feed not started"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800">
            <AlertTriangle size={13} className="mr-2 inline" />{error}
          </div>
        ) : null}

        {!portfolio ? (
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-8 shadow-[0_12px_38px_rgba(31,27,20,0.04)]">
            <div className="max-w-2xl">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#D6A66A]">First activation</div>
              <h2 className="mt-2 text-2xl font-semibold">Create the governed paper portfolio.</h2>
              <p className="mt-2 text-[12px] leading-5 text-[#706B64]">This creates the portfolio and its independent risk policy. No real-money execution path is created.</p>
              <button type="button" disabled={working === "INITIALIZE"} onClick={() => act("INITIALIZE")} className="mt-5 rounded-xl bg-[#1F1E1B] px-4 py-2.5 text-[11px] font-medium text-white disabled:opacity-40">
                {working === "INITIALIZE" ? "Initializing…" : "Initialize Markets"}
              </button>
            </div>
          </section>
        ) : (
          <>

            <section className="overflow-hidden rounded-[26px] border border-[#CDAA78]/20 bg-[#FFFDF9] shadow-[0_18px_55px_rgba(73,55,35,0.07)]">
              <div className="grid border-b border-black/[0.055] sm:grid-cols-2 xl:grid-cols-4">
                {watchlist.slice(0, 4).map((item, index) => {
                  const snapshot = latestSnapshotBySymbol.get(item.symbol);
                  const decision = latestBySymbol.get(item.symbol);
                  return (
                    <div
                      key={item.id}
                      className={index > 0 ? "border-t border-black/[0.05] px-4 py-3.5 sm:border-l sm:border-t-0" : "px-4 py-3.5"}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-semibold tracking-[0.05em] text-[#554E46]">{item.symbol}</div>
                          <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#25211E]">
                            {snapshot?.latest_trade_price ? money(snapshot.latest_trade_price, baseCurrency) : "—"}
                          </div>
                        </div>
                        <div className={
                          decision?.action === "BUY"
                            ? "rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700"
                            : decision?.action === "SELL"
                              ? "rounded-full bg-red-50 px-2 py-1 text-[8px] font-semibold text-red-700"
                              : "rounded-full bg-[#F2EEE8] px-2 py-1 text-[8px] font-semibold text-[#766E65]"
                        }>
                          {decision?.action || "WATCH"}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[8px] text-[#938B81]">
                        <span>{item.asset_type || "EQUITY"}</span>
                        <span>{decision ? (Number(decision.confidence || 0) * 100).toFixed(0) + "% confidence" : "Awaiting decision"}</span>
                      </div>
                    </div>
                  );
                })}
                {!watchlist.length ? (
                  <div className="col-span-full px-5 py-4 text-[10px] text-[#8F877E]">
                    Add a symbol above to populate the live market strip.
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 p-3 lg:grid-cols-[1.04fr_1.24fr_0.72fr]">
                <div className="rounded-[22px] border border-black/[0.06] bg-white p-5 shadow-[0_10px_28px_rgba(67,50,31,0.045)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#9A7449]">Portfolio · Paper Trading</div>
                      <div className="mt-1 text-[10px] text-[#9A938A]">{portfolio.name}</div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/10 bg-emerald-50 px-2.5 py-1 text-[8px] font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {paperAccount?.status || "ACTIVE"}
                    </div>
                  </div>

                  <div className="mt-6 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[30px] font-semibold tracking-[-0.055em] text-[#1E1B18]">
                        {paperAccount ? money(paperAccount.equity, baseCurrency) : "—"}
                      </div>
                      <div className="mt-1 text-[9px] text-[#918A81]">Current portfolio equity</div>
                    </div>
                    <div className={
                      portfolioReturnPct == null
                        ? "text-right text-[#8C857C]"
                        : portfolioReturnPct >= 0
                          ? "text-right text-emerald-700"
                          : "text-right text-red-700"
                    }>
                      <div className="text-[19px] font-semibold">
                        {portfolioReturnPct == null ? "—" : (portfolioReturnPct >= 0 ? "+" : "") + portfolioReturnPct.toFixed(2) + "%"}
                      </div>
                      <div className="mt-1 text-[8px] text-[#9A938A]">Total return</div>
                    </div>
                  </div>

                  <div className="mt-6 h-24 overflow-hidden rounded-2xl border border-[#CDAA78]/15 bg-[linear-gradient(180deg,#FFFBF5_0%,#FBF7F0_100%)] px-4 py-3">
                    {equityChartRows.length ? (
                      <div className="flex h-full items-end gap-1">
                        {equityChartRows.map((row) => {
                          const equity = Number(row.equity);
                          const normalized = Number.isFinite(equity) && equityChartMin != null
                            ? 18 + (((equity - equityChartMin) / equityChartRange) * 76)
                            : 18;
                          return (
                            <div
                              key={row.id}
                              title={money(equity, baseCurrency)}
                              className="flex-1 rounded-t-full bg-[#B98B54]/24"
                              style={{ height: normalized + "%" }}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-[#9D958C]">
                        Equity history will appear after the first recorded portfolio snapshots.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 grid grid-cols-4 gap-2">
                    {[
                      ["Cash", paperAccount ? money(paperAccount.cash_balance, baseCurrency) : "—"],
                      ["Positions", openPositions.length],
                      ["Orders", orders.filter((row) => ["QUEUED", "PARTIALLY_FILLED"].includes(row.status)).length],
                      ["Breaches", openRiskEvents],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className="text-[8px] text-[#9A938A]">{label}</div>
                        <div className="mt-1 truncate text-[11px] font-semibold text-[#443E37]">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3">
                  {[
                    ["01", "Research", "Find opportunities with live market data, filings and specialist evidence.", BrainCircuit, evidence.length + " evidence events · " + watchlist.length + " tracked"],
                    ["02", "Decide", "Turn evidence into explicit, confidence-scored investment decisions.", Lightbulb, decisions.length + " governed decisions"],
                    ["03", "Risk", "Apply portfolio limits, market freshness, liquidity and execution controls.", ShieldCheck, openRiskEvents ? openRiskEvents + " open risk event" + (openRiskEvents === 1 ? "" : "s") : "Within current controls"],
                    ["04", "Learn", "Measure outcomes, strategy health and walk-forward performance.", BookOpen, outcomes.length + " measured outcomes"],
                  ].map(([step, label, description, Icon, detail]) => {
                    const href = step === "01"
                      ? "#markets-research"
                      : step === "02"
                        ? "#markets-research"
                        : step === "03"
                          ? "#markets-risk"
                          : "#markets-performance";
                    return (
                    <a key={step} href={href} className="group rounded-[18px] border border-black/[0.055] bg-white px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-[#B98B54]/25 hover:shadow-[0_10px_26px_rgba(83,59,32,0.065)]">
                      <div className="grid grid-cols-[38px_1fr_auto] items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-xl border border-[#CDAA78]/25 bg-[#FBF5EA] text-[#8A6239]">
                          <Icon size={15} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-semibold text-[#B08352]">{step}</span>
                            <span className="text-[13px] font-semibold text-[#2B2723]">{label}</span>
                          </div>
                          <div className="mt-0.5 text-[9px] leading-4 text-[#817A72]">{description}</div>
                          <div className="mt-1.5 text-[8px] font-medium text-[#A1784A]">{detail}</div>
                        </div>
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#F5F0E9] text-[#7B6D5D] transition group-hover:bg-[#EEE3D4] group-hover:text-[#8A6239]">
                          <ArrowRight size={13} />
                        </div>
                      </div>
                    </a>
                    );
                  })}
                </div>

                <aside className="grid gap-3 lg:sticky lg:top-20 lg:self-start">
                  <div className="rounded-[20px] border border-[#CDAA78]/20 bg-white/90 p-4 shadow-[0_10px_28px_rgba(73,55,35,0.045)]">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-xl border border-[#CDAA78]/20 bg-[#FBF5EA] text-[#8A6239]">
                        <Sparkles size={14} />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-[#332E29]">Market Intelligence</div>
                        <div className="text-[8px] text-[#999188]">Latest governed context</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-1.5">
                      {[
                        ["Research", "#markets-research"],
                        ["Risk", "#markets-risk"],
                        ["Execution", "#markets-execution"],
                      ].map(([label, href]) => (
                        <a
                          key={label}
                          href={href}
                          className="rounded-lg border border-[#CDAA78]/15 bg-[#FBF7F1] px-2 py-2 text-center text-[8px] font-medium text-[#786857] transition hover:border-[#B98B54]/30 hover:bg-[#F5EBDD] hover:text-[#8A6239]"
                        >
                          {label}
                        </a>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2">
                      {decisions.slice(0, 3).map((decision) => (
                        <div key={decision.id} className="rounded-xl border border-black/[0.05] bg-[#FCFAF7] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-semibold text-[#413B35]">{decision.symbol}</span>
                            <span className="text-[8px] font-semibold text-[#9A7449]">{decision.action}</span>
                          </div>
                          <div className="mt-1 truncate text-[8px] text-[#8B837B]">
                            {(Number(decision.confidence || 0) * 100).toFixed(0)}% confidence · {decision.risk_status}
                          </div>
                        </div>
                      ))}
                      {!decisions.length ? (
                        <div className="rounded-xl border border-dashed border-black/[0.08] px-3 py-5 text-center text-[9px] text-[#938B82]">
                          No governed decisions yet.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[#CDAA78]/20 bg-white/90 p-4 shadow-[0_10px_28px_rgba(73,55,35,0.045)]">
                    <div className="flex items-center gap-2 text-[#8A6239]">
                      <Database size={14} />
                      <span className="text-[10px] font-semibold">Live Market Evidence</span>
                    </div>
                    <div className="mt-3 space-y-2 text-[9px]">
                      {[
                        ["Market feed", feedStatus?.connection_state === "CONNECTED"],
                        ["Research evidence", evidence.length > 0],
                        ["Company filings", filings.length > 0],
                        ["Market snapshots", snapshots.length > 0],
                      ].map(([label, active]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-[#6E675F]">
                            <span className={active ? "h-1.5 w-1.5 rounded-full bg-emerald-500" : "h-1.5 w-1.5 rounded-full bg-[#C8C1B8]"} />
                            {label}
                          </span>
                          <span className={active ? "font-medium text-emerald-700" : "text-[#AAA39A]"}>{active ? "Live" : "Waiting"}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl bg-[#FBF7F1] px-3 py-2.5 text-[8px] text-[#897E72]">
                      {liveEvidenceCount}/4 evidence channels currently active.
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <nav className="sticky top-2 z-20 flex gap-1 overflow-x-auto rounded-2xl border border-[#CDAA78]/20 bg-[#FFFDF9]/95 p-1.5 shadow-[0_10px_28px_rgba(73,55,35,0.07)] backdrop-blur">
              {[
                ["Overview", "#markets-overview"],
                ["Portfolio", "#markets-portfolio"],
                ["Research", "#markets-research"],
                ["Risk", "#markets-risk"],
                ["Automation", "#markets-automation"],
                ["Performance", "#markets-performance"],
                ["Execution", "#markets-execution"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="shrink-0 rounded-xl px-3 py-2 text-[9px] font-medium text-[#6E665D] transition hover:bg-[#F7F0E6] hover:text-[#8A6239]"
                >
                  {label}
                </a>
              ))}
            </nav>

            <section id="markets-portfolio" className="scroll-mt-24 rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
              <div className="flex flex-col gap-3 border-b border-[#CDAA78]/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#A37849]">Paper portfolio</div>
                  <h2 className="mt-1 text-[18px] font-semibold">Simulation account & positions</h2>
                </div>
                <button
                  type="button"
                  onClick={() => act("PROCESS_PAPER_ORDERS")}
                  disabled={!canExecutePaper || Boolean(working) || !orders.some((row) => row.status === "QUEUED")}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#2B2723] px-3.5 text-[10px] font-medium text-white shadow-[0_6px_16px_rgba(43,39,35,0.14)] transition hover:bg-[#1F1C19] disabled:opacity-35"
                >
                  <Activity size={12} />
                  {!canExecutePaper
                    ? "Owner authority required"
                    : working === "PROCESS_PAPER_ORDERS"
                      ? "Processing…"
                      : "Process paper orders"}
                </button>
              </div>

              <div className="grid gap-2 border-b border-[#CDAA78]/15 p-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["Equity", paperAccount ? money(paperAccount.equity, baseCurrency) : "—"],
                  ["Cash", paperAccount ? money(paperAccount.cash_balance, baseCurrency) : "—"],
                  ["Realized P&L", paperAccount ? money(paperAccount.realized_pnl, baseCurrency) : "—"],
                  ["Unrealized P&L", paperAccount ? money(paperAccount.unrealized_pnl, baseCurrency) : "—"],
                  ["Positions", paperPositions.filter((row) => Number(row.quantity || 0) > 0).length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                    <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                    <div className="mt-1 text-[14px] font-semibold">{value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[10px]">
                  <thead className="bg-[#FBF7F1] text-[#766E65]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Average</th>
                      <th className="px-4 py-3 font-medium">Market</th>
                      <th className="px-4 py-3 font-medium">Value</th>
                      <th className="px-4 py-3 font-medium">Stop</th>
                      <th className="px-4 py-3 font-medium">Take profit</th>
                      <th className="px-4 py-3 font-medium">High water</th>
                      <th className="px-4 py-3 font-medium">Trailing</th>
                      <th className="px-4 py-3 font-medium">Age</th>
                      <th className="px-4 py-3 font-medium">Unrealized</th>
                      <th className="px-4 py-3 font-medium">Realized</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {paperPositions.filter((row) => Number(row.quantity || 0) > 0).length ? (
                      paperPositions.filter((row) => Number(row.quantity || 0) > 0).map((position) => (
                        <tr key={position.id} className="transition hover:bg-[#FBF7F1]/70">
                          <td className="px-4 py-3 font-semibold">{position.symbol}</td>
                          <td className="px-4 py-3">{position.quantity}</td>
                          <td className="px-4 py-3">{position.average_entry_price ? money(position.average_entry_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{position.market_price ? money(position.market_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{money(position.market_value, baseCurrency)}</td>
                          <td className="px-4 py-3">{position.stop_loss_price ? money(position.stop_loss_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{position.take_profit_price ? money(position.take_profit_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{position.high_water_price ? money(position.high_water_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{trailingLevel(position, policy) ? money(trailingLevel(position, policy), baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{positionAgeDays(position.opened_at) == null ? "—" : `${positionAgeDays(position.opened_at).toFixed(1)}d`}</td>
                          <td className={
                            Number(position.unrealized_pnl || 0) > 0
                              ? "px-4 py-3 font-medium text-emerald-700"
                              : Number(position.unrealized_pnl || 0) < 0
                                ? "px-4 py-3 font-medium text-red-700"
                                : "px-4 py-3"
                          }>{money(position.unrealized_pnl, baseCurrency)}</td>
                          <td className="px-4 py-3">{money(position.realized_pnl, baseCurrency)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-[#9A968E]">
                          No paper positions yet. Only risk-approved simulated fills appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[#CDAA78]/15 px-4 py-2.5 text-[9px] text-[#8A867F]">
                {paperFills.length} simulated fill{paperFills.length === 1 ? "" : "s"} recorded · no live broker execution
              </div>
            </section>

            <section id="markets-research" className="scroll-mt-24 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                <div className="flex flex-col gap-3 border-b border-[#CDAA78]/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[#A37849]">Universe</div>
                    <h2 className="mt-1 text-[18px] font-semibold">Watchlist & latest decisions</h2>
                  </div>
                  <form onSubmit={addWatchlist} className="flex gap-2">
                    <input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Ticker e.g. AAPL" className="h-9 w-40 rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-3 text-[11px] uppercase text-[#2E2B27] outline-none placeholder:normal-case placeholder:text-[#AAA69E]" />
                    <button type="submit" disabled={working === "ADD_WATCHLIST"} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2B2723] px-3.5 text-[10px] font-medium text-white shadow-[0_6px_16px_rgba(43,39,35,0.12)] transition hover:bg-[#1F1C19] disabled:opacity-40">
                      <Plus size={12} /> Add
                    </button>
                  </form>
                </div>
                <div className="divide-y divide-black/[0.06]">
                  {watchlist.length ? watchlist.map((item) => {
                    const decision = latestBySymbol.get(item.symbol);
                    const snapshot = latestSnapshotBySymbol.get(item.symbol);
                    const backtest = latestBacktestBySymbol.get(item.symbol);
                    const refreshing = working === `REFRESH_INTELLIGENCE:${item.symbol}`;
                    return (
                      <div key={item.id} className="grid gap-3 p-4 transition hover:bg-[#FBF7F1]/70 sm:grid-cols-[minmax(120px,1fr)_auto_auto_auto_minmax(250px,auto)] sm:items-center">
                        <div>
                          <div className="text-[14px] font-semibold">{item.symbol}</div>
                          <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#938C83]">{item.asset_type} · {item.thesis_horizon}</div>
                          <div className="mt-1 text-[8px] text-[#9A968E]">
                            {backtest?.status === "COMPLETED"
                              ? `WF ${(Number(backtest.total_return || 0) * 100).toFixed(1)}% · DD ${Number(backtest.max_drawdown_pct || 0).toFixed(1)}% · ${Number(backtest.trade_count || 0)} trades`
                              : backtest
                                ? `Walk-forward: ${backtest.status}`
                                : "Walk-forward: not run"}
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-[9px] uppercase tracking-[0.12em] text-[#938C83]">Last</div>
                          <div className="mt-1 text-[11px] font-medium">{snapshot?.latest_trade_price ? money(snapshot.latest_trade_price, baseCurrency) : "—"}</div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-[9px] uppercase tracking-[0.12em] text-[#938C83]">Decision</div>
                          <div className={
                            decision?.action === "BUY"
                              ? "mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700"
                              : decision?.action === "SELL"
                                ? "mt-1 inline-flex rounded-full bg-red-50 px-2 py-1 text-[8px] font-semibold text-red-700"
                                : "mt-1 inline-flex rounded-full bg-[#F2EEE8] px-2 py-1 text-[8px] font-semibold text-[#766E65]"
                          }>
                            {decision?.action || "NO DECISION"}
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-[9px] uppercase tracking-[0.12em] text-[#938C83]">Confidence</div>
                          <div className="mt-1 text-[11px] font-medium">{decision ? `${(Number(decision.confidence) * 100).toFixed(1)}%` : "—"}</div>
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                          <button
                            type="button"
                            disabled={Boolean(working)}
                            onClick={async () => {
                              setWorking(`REFRESH_INTELLIGENCE:${item.symbol}`);
                              setError("");
                              try {
                                const response = await fetch("/api/markets/command-center", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify({
                                    organizationId,
                                    entityId,
                                    action: "REFRESH_INTELLIGENCE",
                                    symbol: item.symbol,
                                    exchange: item.exchange || null,
                                  }),
                                });
                                const json = await response.json().catch(() => ({}));
                                if (!response.ok || !json?.success) throw new Error(json?.error || "Unable to refresh intelligence");
                                await load();
                              } catch (refreshError) {
                                setError(refreshError?.message || "Unable to refresh intelligence");
                              } finally {
                                setWorking("");
                              }
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-[#FCFBF9] px-2.5 text-[9px] font-medium text-[#5E5851] transition hover:border-[#D6A66A]/45 hover:text-[#8A6239] disabled:opacity-40"
                          >
                            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
                            Refresh
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(working)}
                            onClick={() => act("RUN_WALK_FORWARD", {
                              symbol: item.symbol,
                              training_bars: 80,
                              test_bars: 20,
                              transaction_cost_bps: 10,
                              initial_equity: 100000,
                            })}
                            className="inline-flex h-8 items-center rounded-lg border border-[#D6A66A]/35 bg-[#FBF7F1] px-2.5 text-[9px] font-medium text-[#8A6239] disabled:opacity-40"
                          >
                            {working === "RUN_WALK_FORWARD" ? "Validating…" : "Walk-forward"}
                          </button>
                          {["BUY", "SELL"].includes(decision?.action) ? (
                            canExecutePaper ? (
                              <>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={paperQuantityBySymbol[item.symbol] ?? ""}
                                  onChange={(event) => setPaperQuantityBySymbol((current) => ({
                                    ...current,
                                    [item.symbol]: event.target.value,
                                  }))}
                                  placeholder="Qty"
                                  className="h-8 w-20 rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2 text-[9px] text-[#2E2B27] outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={Boolean(working)}
                                  onClick={() => queuePaperDecision(decision)}
                                  className="inline-flex h-8 items-center rounded-lg bg-[#2B2723] px-2.5 text-[9px] font-medium text-white shadow-[0_4px_12px_rgba(43,39,35,0.10)] transition hover:bg-[#1F1C19] disabled:opacity-40"
                                >
                                  Queue {decision.action}
                                </button>
                              </>
                            ) : (
                              <div className="inline-flex h-8 items-center rounded-lg border border-black/[0.07] bg-[#F7F6F3] px-2.5 text-[9px] text-[#817D76]">
                                Owner authority required for PAPER execution
                              </div>
                            )
                          ) : null}
                        </div>
                      </div>
                    );
                  }) : <div className="p-8 text-center text-[11px] text-[#8A867F]">Add the first instrument to start the research universe.</div>}
                </div>
              </div>

              <div className="space-y-4">
                <div id="markets-risk" className="scroll-mt-24 rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center gap-2 text-[#A37849]"><ShieldCheck size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Risk authority</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Independent execution limits</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["Max position", `${Number(policy.max_position_pct || 10)}%`],
                      ["Sector cap", `${Number(policy.max_sector_pct || 30)}%`],
                      ["Industry cap", `${Number(policy.max_industry_pct || 20)}%`],
                      ["Gross exposure", `${Number(policy.max_gross_exposure_pct || 100)}%`],
                      ["Correlated cap", `${Number(policy.max_correlated_exposure_pct || 35)}%`],
                      ["Correlation gate", Number(policy.correlation_threshold || 0.8).toFixed(2)],
                      ["Daily loss", `${Number(policy.max_daily_loss_pct || 2)}%`],
                      ["Max drawdown", `${Number(policy.max_portfolio_drawdown_pct || 10)}%`],
                      ["Max VaR 95%", `${Number(policy.max_portfolio_var_95_pct || 5)}%`],
                      ["Max ES 95%", `${Number(policy.max_portfolio_expected_shortfall_95_pct || 8)}%`],
                      ["Max incremental VaR", `${Number(policy.max_incremental_var_95_pct ?? 1.5)}%`],
                      ["Max incremental ES", `${Number(policy.max_incremental_expected_shortfall_95_pct ?? 2.5)}%`],
                      ["Max position vol", `${Number(policy.max_position_annualized_volatility_pct || 100)}%`],
                      ["Max stress loss", `${Number(policy.max_portfolio_stress_loss_pct || 12)}%`],
                      ["Max portfolio beta", Number(policy.max_portfolio_beta ?? 1.5).toFixed(2)],
                      ["Max position ADV", `${Number(policy.max_position_adv_pct ?? 10)}%`],
                      ["Max liquidation", `${Number(policy.max_days_to_liquidate ?? 5)}d`],
                      ["Max daily-bar age", `${Number(policy.max_daily_bar_age_hours ?? 120)}h`],
                      ["24h turnover cap", `${Number(policy.max_rolling_24h_turnover_pct || 100)}%`],
                      ["24h exec-cost cap", `${Number(policy.max_rolling_24h_execution_cost_pct_equity || 0.25)}%`],
                      ["Max open positions", Number(policy.max_open_positions || 20)],
                      ["Loss-streak limit", Number(policy.max_consecutive_losing_closes || 3)],
                      ["Min cash reserve", `${Number(policy.min_cash_reserve_pct ?? 10)}%`],
                      ["Loss re-entry lock", `${Number(policy.loss_reentry_cooloff_hours ?? 24)}h`],
                      ["Min confidence", `${(Number(policy.min_decision_confidence || 0.7) * 100).toFixed(0)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] px-3 py-2.5">
                    <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Latest measured exposure</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] text-[#5E5851]">
                      <div>
                        <div className="text-[#9A968E]">Gross</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk ? `${Number(latestPortfolioRisk.projected_gross_exposure_pct || 0).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Sector</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk ? `${Number(latestPortfolioRisk.projected_sector_exposure_pct || 0).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Industry</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk ? `${Number(latestPortfolioRisk.projected_industry_exposure_pct || 0).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Correlated</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk ? `${Number(latestPortfolioRisk.projected_correlated_exposure_pct || 0).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">VaR 95%</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.historical_risk?.portfolio?.var_95_pct == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.historical_risk.portfolio.var_95_pct).toFixed(2)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">ES 95%</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.historical_risk?.portfolio?.expected_shortfall_95_pct == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.historical_risk.portfolio.expected_shortfall_95_pct).toFixed(2)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Candidate vol</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.historical_risk?.candidate?.annualized_volatility_pct == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.historical_risk.candidate.annualized_volatility_pct).toFixed(1)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Incremental VaR</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.historical_risk?.incremental_var_95_pct == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.historical_risk.incremental_var_95_pct).toFixed(2)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Incremental ES</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.historical_risk?.incremental_expected_shortfall_95_pct == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.historical_risk.incremental_expected_shortfall_95_pct).toFixed(2)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Worst stress loss</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.stress_risk?.worst_scenario?.loss_pct_equity == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.stress_risk.worst_scenario.loss_pct_equity).toFixed(2)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Portfolio beta</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.benchmark_beta?.projected_beta == null
                            ? "—"
                            : Number(latestPortfolioRisk.benchmark_beta.projected_beta).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Position / ADV</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.liquidity_capacity?.projected_position_adv_pct == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.liquidity_capacity.projected_position_adv_pct).toFixed(2)}%`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#9A968E]">Days to liquidate</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.liquidity_capacity?.projected_days_to_liquidate == null
                            ? "—"
                            : `${Number(latestPortfolioRisk.liquidity_capacity.projected_days_to_liquidate).toFixed(2)}d`}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[#9A968E]">Worst scenario</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk?.stress_risk?.worst_scenario?.id
                            ? String(latestPortfolioRisk.stress_risk.worst_scenario.id).replaceAll("_", " ")
                            : "—"}
                        </div>
                      </div>
                    </div>
                    {latestPortfolioRisk?.historical_data_freshness ? (
                      <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[8px] ${
                        (latestPortfolioRisk.historical_data_freshness.stale_symbols || []).length
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-black/[0.06] bg-white text-[#5E5851]"
                      }`}>
                        Historical data: {(latestPortfolioRisk.historical_data_freshness.stale_symbols || []).length
                          ? `STALE · ${latestPortfolioRisk.historical_data_freshness.stale_symbols.join(", ")}`
                          : "FRESH"}
                        {" · "}
                        {Number(latestPortfolioRisk.historical_data_freshness.max_daily_bar_age_hours ?? policy.max_daily_bar_age_hours ?? 120).toFixed(0)}h max age
                      </div>
                    ) : null}
                    {latestPortfolioRisk?.candidate_sector ? (
                      <div className="mt-2 text-[8px] text-[#9A968E]">
                        Last evaluated sector: {latestPortfolioRisk.candidate_sector}
                        {latestPortfolioRisk?.candidate_industry ? ` · Industry: ${latestPortfolioRisk.candidate_industry}` : ""}
                      </div>
                    ) : null}
                    {latestPortfolioRiskBudget ? (
                      <div className="mt-2 rounded-lg border border-[#D6A66A]/20 bg-[#FBF7F1] px-2.5 py-2 text-[8px] text-[#7B654A]">
                        Risk-budget allocator: {String(latestPortfolioRiskBudget.binding_dimension || "NONE").replaceAll("_", " ")}
                        {" · "}
                        {Number(latestPortfolioRiskBudget.max_utilization || 0).toFixed(2)}× limit utilization
                        {" · "}
                        {(Number(latestPortfolioRiskBudget.scale || 1) * 100).toFixed(0)}% of pre-budget BUY notional
                      </div>
                    ) : null}
                    {latestTradingBudget ? (
                      <div className="mt-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 text-[8px] text-[#5E5851]">
                        Rolling 24h: {Number(latestTradingBudget.projected_turnover_pct_equity || 0).toFixed(1)}% projected turnover
                        {" · "}
                        {Number(latestTradingBudget.realized_execution_cost_pct_equity || 0).toFixed(3)}% execution-cost leakage
                        {" · "}
                        {Number(latestTradingBudget.fill_count || 0)} fills
                      </div>
                    ) : null}
                    {latestCashReserve ? (
                      <div className="mt-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 text-[8px] text-[#5E5851]">
                        Cash reserve: {latestCashReserve.projected_cash_pct_equity == null ? "—" : `${Number(latestCashReserve.projected_cash_pct_equity).toFixed(1)}%`} projected
                        {" · "}
                        {Number(latestCashReserve.min_cash_reserve_pct ?? policy.min_cash_reserve_pct ?? 10).toFixed(1)}% floor
                        {" · "}
                        {Number(latestCashReserve.execution_buffer_bps ?? policy.cash_reserve_execution_buffer_bps ?? 25).toFixed(0)} bps execution buffer
                      </div>
                    ) : null}
                    {latestSymbolLossReentry ? (
                      <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[8px] ${
                        latestSymbolLossReentry.lockout_active
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-black/[0.06] bg-white text-[#5E5851]"
                      }`}>
                        Symbol re-entry: {latestSymbolLossReentry.symbol || "—"}
                        {" · "}
                        {latestSymbolLossReentry.latest_close_outcome || "no realized close"}
                        {latestSymbolLossReentry.lockout_active && latestSymbolLossReentry.reentry_allowed_at
                          ? ` · locked until ${new Date(latestSymbolLossReentry.reentry_allowed_at).toLocaleString()}`
                          : ""}
                      </div>
                    ) : null}
                    {(latestOpenPositionLimit || latestLossStreakCooloff) ? (
                      <div className="mt-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 text-[8px] text-[#5E5851]">
                        Discipline: {Number(latestOpenPositionLimit?.projected_open_positions || latestOpenPositionLimit?.open_positions || 0)}/{Number(latestOpenPositionLimit?.max_open_positions || policy.max_open_positions || 20)} projected positions
                        {" · "}
                        {Number(latestLossStreakCooloff?.consecutive_losing_closes || 0)} consecutive losing closes
                        {latestLossStreakCooloff?.cooloff_active ? " · COOL-OFF ACTIVE" : ""}
                      </div>
                    ) : null}
                    {latestMarketRegime ? (
                      <div className="mt-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 text-[8px] text-[#5E5851]">
                        Benchmark regime: {String(latestMarketRegime.regime || "UNKNOWN").replaceAll("_", " ")}
                        {" · "}
                        {(Number(latestMarketRegime.confidence || 0) * 100).toFixed(0)}% classification confidence
                        {" · "}
                        {(Number(latestMarketRegime.sizing_scale || 1) * 100).toFixed(0)}% BUY sizing multiplier
                      </div>
                    ) : null}
                  </div>
                  <details className="group mt-3 overflow-hidden rounded-2xl border border-[#CDAA78]/18 bg-white/80">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[9px] font-medium text-[#655B51] transition hover:bg-[#FBF7F1]">
                      <span>
                        <span className="block text-[8px] uppercase tracking-[0.14em] text-[#9A7449]">Owner policy controls</span>
                        <span className="mt-1 block text-[8px] font-normal text-[#91887E]">Advanced limits, protection rules and execution thresholds</span>
                      </span>
                      <ChevronDown size={13} className="text-[#9A7449] transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-[#CDAA78]/15 px-3.5 py-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Position %", "max_position_pct", "0.1", "100", "0.1"],
                        ["Sector %", "max_sector_pct", "0.1", "100", "0.1"],
                        ["Industry %", "max_industry_pct", "0.1", "100", "0.1"],
                        ["Gross %", "max_gross_exposure_pct", "0.1", "300", "0.1"],
                        ["Correlated %", "max_correlated_exposure_pct", "0.1", "100", "0.1"],
                        ["Correlation", "correlation_threshold", "0", "1", "0.01"],
                        ["Daily loss %", "max_daily_loss_pct", "0.1", "100", "0.1"],
                        ["Drawdown %", "max_portfolio_drawdown_pct", "0.1", "100", "0.1"],
                        ["Min confidence", "min_decision_confidence", "0", "1", "0.01"],
                        ["Quote age sec", "max_market_data_age_seconds", "1", "3600", "1"],
                        ["Max spread bps", "max_spread_bps", "0.1", "10000", "0.1"],
                        ["Min quote notional", "min_quote_notional", "0", "1000000000", "1"],
                        ["Risk history days", "historical_risk_min_observations", "20", "504", "1"],
                        ["Max VaR 95% %", "max_portfolio_var_95_pct", "0.01", "100", "0.1"],
                        ["Max ES 95% %", "max_portfolio_expected_shortfall_95_pct", "0.01", "100", "0.1"],
                        ["Max incremental VaR 95% %", "max_incremental_var_95_pct", "0.01", "100", "0.1"],
                        ["Max incremental ES 95% %", "max_incremental_expected_shortfall_95_pct", "0.01", "100", "0.1"],
                        ["Max position vol %", "max_position_annualized_volatility_pct", "0.01", "1000", "0.1"],
                        ["Max stress loss %", "max_portfolio_stress_loss_pct", "0.01", "100", "0.1"],
                        ["Max portfolio beta", "max_portfolio_beta", "0.1", "5", "0.01"],
                        ["ADV window days", "liquidity_adv_window_days", "5", "252", "1"],
                        ["Liquidity min observations", "liquidity_min_observations", "5", "252", "1"],
                        ["Max position ADV %", "max_position_adv_pct", "0.1", "100", "0.1"],
                        ["Liquidation participation %", "liquidation_participation_pct", "0.1", "100", "0.1"],
                        ["Max days to liquidate", "max_days_to_liquidate", "0.1", "60", "0.1"],
                        ["Max daily-bar age hours", "max_daily_bar_age_hours", "24", "720", "1"],
                        ["Market shock %", "stress_market_shock_pct", "0.01", "100", "0.1"],
                        ["Sector shock %", "stress_sector_shock_pct", "0.01", "100", "0.1"],
                        ["Cluster shock %", "stress_correlated_cluster_shock_pct", "0.01", "100", "0.1"],
                        ["Single-name gap %", "stress_single_name_shock_pct", "0.01", "100", "0.1"],
                        ["24h turnover cap %", "max_rolling_24h_turnover_pct", "0.1", "1000", "0.1"],
                        ["24h exec-cost cap % equity", "max_rolling_24h_execution_cost_pct_equity", "0.001", "10", "0.001"],
                        ["Max open positions", "max_open_positions", "1", "500", "1"],
                        ["Losses before cool-off", "max_consecutive_losing_closes", "1", "50", "1"],
                        ["Loss cool-off hours", "loss_streak_cooloff_hours", "1", "720", "1"],
                        ["Min cash reserve %", "min_cash_reserve_pct", "0", "100", "0.1"],
                        ["Cash execution buffer bps", "cash_reserve_execution_buffer_bps", "0", "10000", "1"],
                        ["Loss re-entry cool-off hours", "loss_reentry_cooloff_hours", "1", "720", "1"],
                      ].map(([label, key, min, max, step]) => (
                        <label key={key}>
                          <span className="text-[8px] text-[#968F86]">{label}</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={riskDraft?.[key] ?? ""}
                            onChange={(event) => setRiskDraft((current) => ({
                              ...(current || {}),
                              [key]: event.target.value,
                            }))}
                            className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2 text-[9px] text-[#2E2B27] outline-none"
                          />
                        </label>
                      ))}
                      <label className="col-span-2">
                        <span className="text-[8px] text-[#968F86]">Max order notional · blank = uncapped</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={riskDraft?.max_order_notional ?? ""}
                          onChange={(event) => setRiskDraft((current) => ({
                            ...(current || {}),
                            max_order_notional: event.target.value,
                          }))}
                          className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2 text-[9px] text-[#2E2B27] outline-none"
                        />
                      </label>
                      <label className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] px-3 py-2.5">
                        <div>
                          <div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Corporate-action BUY blackout</div>
                          <div className="mt-1 text-[8px] leading-4 text-[#817D76]">Block new PAPER BUY exposure around known material corporate actions. SELL de-risking stays available.</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={riskDraft?.block_corporate_action_buys !== false}
                          onChange={(event) => setRiskDraft((current) => ({
                            ...(current || {}),
                            block_corporate_action_buys: event.target.checked,
                          }))}
                          className="h-4 w-4 accent-[#1F1E1B]"
                        />
                      </label>
                      {[
                        ["Event blackout · days before", "corporate_action_blackout_days_before", "0", "30", "1"],
                        ["Event blackout · days after", "corporate_action_blackout_days_after", "0", "30", "1"],
                      ].map(([label, key, min, max, step]) => (
                        <label key={key}>
                          <span className="text-[8px] text-[#968F86]">{label}</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={riskDraft?.[key] ?? ""}
                            onChange={(event) => setRiskDraft((current) => ({
                              ...(current || {}),
                              [key]: event.target.value,
                            }))}
                            className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2 text-[9px] text-[#2E2B27] outline-none"
                          />
                        </label>
                      ))}
                      <label className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] px-3 py-2.5">
                        <div>
                          <div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Protective PAPER exits</div>
                          <div className="mt-1 text-[8px] leading-4 text-[#817D76]">Deterministic stop-loss/take-profit exits for existing long PAPER positions. These are risk controls, not AI predictions.</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={riskDraft?.protective_exits_enabled !== false}
                          onChange={(event) => setRiskDraft((current) => ({
                            ...(current || {}),
                            protective_exits_enabled: event.target.checked,
                          }))}
                          className="h-4 w-4 accent-[#1F1E1B]"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                        <div>
                          <div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Trailing stop</div>
                          <div className="mt-1 text-[8px] leading-4 text-[#817D76]">Ratchets upward from the highest admitted bid-side price. Never loosens automatically.</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={riskDraft?.trailing_stop_enabled !== false}
                          onChange={(event) => setRiskDraft((current) => ({
                            ...(current || {}),
                            trailing_stop_enabled: event.target.checked,
                          }))}
                          className="h-4 w-4 accent-[#1F1E1B]"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                        <div>
                          <div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Maximum holding period</div>
                          <div className="mt-1 text-[8px] leading-4 text-[#817D76]">Deterministically exits stale long PAPER positions after the configured age.</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={riskDraft?.time_exit_enabled !== false}
                          onChange={(event) => setRiskDraft((current) => ({
                            ...(current || {}),
                            time_exit_enabled: event.target.checked,
                          }))}
                          className="h-4 w-4 accent-[#1F1E1B]"
                        />
                      </label>
                      {[
                        ["Default stop-loss %", "default_stop_loss_pct", "0.01", "50", "0.1"],
                        ["Default take-profit %", "default_take_profit_pct", "0.01", "200", "0.1"],
                        ["Trailing stop %", "default_trailing_stop_pct", "0.01", "50", "0.1"],
                        ["Max holding days", "max_holding_days", "1", "3650", "1"],
                      ].map(([label, key, min, max, step]) => (
                        <label key={key}>
                          <span className="text-[8px] text-[#968F86]">{label}</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={riskDraft?.[key] ?? ""}
                            onChange={(event) => setRiskDraft((current) => ({
                              ...(current || {}),
                              [key]: event.target.value,
                            }))}
                            className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2 text-[9px] text-[#2E2B27] outline-none"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => act("UPDATE_RISK_POLICY", {
                        max_position_pct: Number(riskDraft?.max_position_pct || 10),
                        max_sector_pct: Number(riskDraft?.max_sector_pct || 30),
                        max_industry_pct: Number(riskDraft?.max_industry_pct || 20),
                        max_gross_exposure_pct: Number(riskDraft?.max_gross_exposure_pct || 100),
                        max_correlated_exposure_pct: Number(riskDraft?.max_correlated_exposure_pct || 35),
                        correlation_threshold: Number(riskDraft?.correlation_threshold ?? 0.8),
                        max_daily_loss_pct: Number(riskDraft?.max_daily_loss_pct || 2),
                        max_portfolio_drawdown_pct: Number(riskDraft?.max_portfolio_drawdown_pct || 10),
                        min_decision_confidence: Number(riskDraft?.min_decision_confidence ?? 0.7),
                        max_order_notional: riskDraft?.max_order_notional ?? "",
                        max_market_data_age_seconds: Number(riskDraft?.max_market_data_age_seconds ?? 120),
                        max_spread_bps: Number(riskDraft?.max_spread_bps ?? 50),
                        min_quote_notional: Number(riskDraft?.min_quote_notional ?? 0),
                        block_corporate_action_buys: riskDraft?.block_corporate_action_buys !== false,
                        corporate_action_blackout_days_before: Number(riskDraft?.corporate_action_blackout_days_before ?? 3),
                        corporate_action_blackout_days_after: Number(riskDraft?.corporate_action_blackout_days_after ?? 1),
                        protective_exits_enabled: riskDraft?.protective_exits_enabled !== false,
                        default_stop_loss_pct: Number(riskDraft?.default_stop_loss_pct ?? 5),
                        default_take_profit_pct: Number(riskDraft?.default_take_profit_pct ?? 10),
                        trailing_stop_enabled: riskDraft?.trailing_stop_enabled !== false,
                        default_trailing_stop_pct: Number(riskDraft?.default_trailing_stop_pct ?? 7.5),
                        time_exit_enabled: riskDraft?.time_exit_enabled !== false,
                        max_holding_days: Number(riskDraft?.max_holding_days ?? 30),
                        historical_risk_min_observations: Number(riskDraft?.historical_risk_min_observations ?? 60),
                        max_portfolio_var_95_pct: Number(riskDraft?.max_portfolio_var_95_pct ?? 5),
                        max_portfolio_expected_shortfall_95_pct: Number(riskDraft?.max_portfolio_expected_shortfall_95_pct ?? 8),
                        max_incremental_var_95_pct: Number(riskDraft?.max_incremental_var_95_pct ?? 1.5),
                        max_incremental_expected_shortfall_95_pct: Number(riskDraft?.max_incremental_expected_shortfall_95_pct ?? 2.5),
                        max_position_annualized_volatility_pct: Number(riskDraft?.max_position_annualized_volatility_pct ?? 100),
                        max_portfolio_stress_loss_pct: Number(riskDraft?.max_portfolio_stress_loss_pct ?? 12),
                        max_portfolio_beta: Number(riskDraft?.max_portfolio_beta ?? 1.5),
                        liquidity_adv_window_days: Number(riskDraft?.liquidity_adv_window_days ?? 20),
                        liquidity_min_observations: Number(riskDraft?.liquidity_min_observations ?? 15),
                        max_position_adv_pct: Number(riskDraft?.max_position_adv_pct ?? 10),
                        liquidation_participation_pct: Number(riskDraft?.liquidation_participation_pct ?? 10),
                        max_days_to_liquidate: Number(riskDraft?.max_days_to_liquidate ?? 5),
                        max_daily_bar_age_hours: Number(riskDraft?.max_daily_bar_age_hours ?? 120),
                        stress_market_shock_pct: Number(riskDraft?.stress_market_shock_pct ?? 8),
                        stress_sector_shock_pct: Number(riskDraft?.stress_sector_shock_pct ?? 12),
                        stress_correlated_cluster_shock_pct: Number(riskDraft?.stress_correlated_cluster_shock_pct ?? 15),
                        stress_single_name_shock_pct: Number(riskDraft?.stress_single_name_shock_pct ?? 20),
                        max_rolling_24h_turnover_pct: Number(riskDraft?.max_rolling_24h_turnover_pct ?? 100),
                        max_rolling_24h_execution_cost_pct_equity: Number(riskDraft?.max_rolling_24h_execution_cost_pct_equity ?? 0.25),
                        max_open_positions: Number(riskDraft?.max_open_positions ?? 20),
                        max_consecutive_losing_closes: Number(riskDraft?.max_consecutive_losing_closes ?? 3),
                        loss_streak_cooloff_hours: Number(riskDraft?.loss_streak_cooloff_hours ?? 24),
                        min_cash_reserve_pct: Number(riskDraft?.min_cash_reserve_pct ?? 10),
                        cash_reserve_execution_buffer_bps: Number(riskDraft?.cash_reserve_execution_buffer_bps ?? 25),
                        loss_reentry_cooloff_hours: Number(riskDraft?.loss_reentry_cooloff_hours ?? 24),
                      })}
                      className="mt-3 h-8 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-medium text-white disabled:opacity-40"
                    >
                      {working === "UPDATE_RISK_POLICY" ? "Saving…" : "Save risk policy"}
                    </button>
                    </div>
                  </details>
                  <div className="mt-3 rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Known corporate actions</div>
                      <div className="text-[8px] text-[#9A968E]">{corporateActions.length} recorded</div>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {corporateActions.length ? corporateActions.slice(0, 6).map((event) => (
                        <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.05] bg-white px-2.5 py-2">
                          <div className="min-w-0">
                            <div className="text-[9px] font-semibold">{event.symbol}</div>
                            <div className="mt-0.5 truncate text-[8px] text-[#817D76]">
                              {String(event.action_type || "corporate_action").replaceAll("_", " ")}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-[8px] text-[#8A867F]">
                            {event.event_date || event.ex_date || event.process_date || "date unavailable"}
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-lg border border-dashed border-black/[0.08] px-2.5 py-3 text-[8px] text-[#9A968E]">
                          No corporate-action records are currently stored for this portfolio.
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-[8px] leading-4 text-[#9A968E]">
                      Provider coverage is not guaranteed and records may arrive late. An empty list is not proof that no corporate action exists.
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-black/[0.06] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Paper accounting ledger</div>
                      <div className="text-[8px] text-[#9A968E]">PAPER only</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {[
                        ["Applied", corporateActionAdjustmentCounts.applied],
                        ["Unresolved", corporateActionAdjustmentCounts.unresolved],
                        ["Skipped", corporateActionAdjustmentCounts.skipped],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-black/[0.05] bg-[#FCFBF9] px-2.5 py-2">
                          <div className="text-[7px] uppercase tracking-[0.1em] text-[#9A968E]">{label}</div>
                          <div className="mt-0.5 text-[13px] font-semibold">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {corporateActionAdjustments.length ? corporateActionAdjustments.slice(0, 6).map((adjustment) => {
                        const status = String(adjustment.status || "").toUpperCase();
                        const detail = adjustment.adjustment_type === "SPLIT" && adjustment.split_ratio
                          ? `ratio ${Number(adjustment.split_ratio).toFixed(4)}×`
                          : adjustment.adjustment_type === "CASH_DIVIDEND" && adjustment.cash_amount != null
                            ? `cash ${formatMoney(adjustment.cash_amount, baseCurrency)} · qty ${Number(adjustment.entitlement_quantity || 0).toFixed(4)}`
                            : adjustment.reason || "No accounting mutation";
                        return (
                          <div key={adjustment.id} className="rounded-lg border border-black/[0.05] bg-[#FCFBF9] px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[9px] font-semibold">
                                  {adjustment.symbol} · {String(adjustment.adjustment_type || "UNSUPPORTED").replaceAll("_", " ")}
                                </div>
                                <div className="mt-0.5 truncate text-[8px] text-[#817D76]">{detail}</div>
                              </div>
                              <div className={`shrink-0 rounded-full px-2 py-0.5 text-[7px] font-medium ${
                                status === "APPLIED"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : status === "UNRESOLVED"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-[#F3F1ED] text-[#817D76]"
                              }`}>
                                {status || "UNKNOWN"}
                              </div>
                            </div>
                            {adjustment.reason ? (
                              <div className="mt-1 text-[8px] leading-4 text-[#9A968E]">{adjustment.reason}</div>
                            ) : null}
                          </div>
                        );
                      }) : (
                        <div className="rounded-lg border border-dashed border-black/[0.08] px-2.5 py-3 text-[8px] text-[#9A968E]">
                          No corporate-action accounting adjustments have been recorded yet.
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-[8px] leading-4 text-[#9A968E]">
                      Ambiguous or late events remain UNRESOLVED and do not mutate PAPER positions or cash. This ledger never changes live-execution authority.
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50 px-3 py-2.5 text-[10px] text-emerald-700">
                    Live broker execution: <span className="font-semibold">DISABLED</span>
                  </div>
                </div>

                <div id="markets-automation" className="scroll-mt-24 rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#A37849]"><Activity size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Paper autopilot</span></div>
                    <div className={`rounded-full px-2.5 py-1 text-[8px] font-medium ${
                      automationPolicy.circuit_breaker_latched
                        ? "bg-red-100 text-red-800"
                        : automationPolicy.kill_switch
                          ? "bg-red-50 text-red-700"
                          : automationPolicy.auto_paper_enabled
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-[#F3F1ED] text-[#817D76]"
                    }`}>
                      {automationPolicy.circuit_breaker_latched
                        ? "CIRCUIT BREAKER"
                        : automationPolicy.kill_switch
                          ? "KILL SWITCH"
                          : automationPolicy.auto_paper_enabled
                            ? "ENABLED"
                            : "OFF"}
                    </div>
                  </div>
                  <h2 className="mt-2 text-[18px] font-semibold">Autonomous simulation</h2>
                  <p className="mt-1 text-[9px] leading-4 text-[#8A867F]">
                    Research, decisions, sizing, risk checks and fills can run automatically in PAPER mode only.
                  </p>

                  {automationPolicy.circuit_breaker_latched ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-red-700">Portfolio circuit breaker latched</div>
                        <div className="text-[8px] text-red-600">
                          {automationPolicy.circuit_breaker_triggered_at
                            ? new Date(automationPolicy.circuit_breaker_triggered_at).toLocaleString()
                            : "Active"}
                        </div>
                      </div>
                      <div className="mt-1 text-[9px] leading-4 text-red-700">
                        {automationPolicy.circuit_breaker_reason || "Portfolio risk limit breached."}
                      </div>
                      {openCircuitBreakerEvent?.metrics ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-red-700">
                          <div>Daily loss: {Number(openCircuitBreakerEvent.metrics.daily_loss_pct || 0).toFixed(2)}%</div>
                          <div>Drawdown: {Number(openCircuitBreakerEvent.metrics.drawdown_pct || 0).toFixed(2)}%</div>
                          <div>Daily limit: {Number(openCircuitBreakerEvent.metrics.max_daily_loss_pct || 0).toFixed(2)}%</div>
                          <div>Drawdown limit: {Number(openCircuitBreakerEvent.metrics.max_portfolio_drawdown_pct || 0).toFixed(2)}%</div>
                        </div>
                      ) : null}
                      <div className="mt-2 text-[8px] leading-4 text-red-600">
                        New strategy entries are blocked. Existing long PAPER exposure is being liquidated through the normal session, liquidity and partial-fill controls.
                      </div>
                    </div>
                  ) : null}

                  <details className="group mt-3 overflow-hidden rounded-2xl border border-[#CDAA78]/18 bg-white/80">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[9px] font-medium text-[#655B51] transition hover:bg-[#FBF7F1]">
                      <span>
                        <span className="block text-[8px] uppercase tracking-[0.14em] text-[#9A7449]">Automation controls</span>
                        <span className="mt-1 block text-[8px] font-normal text-[#91887E]">Sizing, cadence, validation and drift thresholds</span>
                      </span>
                      <ChevronDown size={13} className="text-[#9A7449] transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-[#CDAA78]/15 px-3.5 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Cycle seconds", "cycle_interval_seconds", "60", "86400", "1"],
                      ["Target position %", "target_position_pct", "0.1", "10", "0.1"],
                      ["Target annualized vol %", "target_annualized_volatility_pct", "1", "300", "0.1"],
                      ["Min confidence", "min_confidence", "0", "1", "0.01"],
                      ["Max trades/cycle", "max_trades_per_cycle", "1", "20", "1"],
                      ["Cooldown minutes", "cooldown_minutes", "0", "10080", "1"],
                    ].map(([label, key, min, max, step]) => (
                      <label key={key} className={key === "cooldown_minutes" ? "col-span-2" : ""}>
                        <span className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">{label}</span>
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={automationDraft?.[key] ?? ""}
                          onChange={(event) => setAutomationDraft((current) => ({
                            ...(current || {}),
                            [key]: event.target.value,
                          }))}
                          className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2.5 text-[10px] text-[#2E2B27] outline-none"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                    <label className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Walk-forward readiness gate</div>
                        <div className="mt-1 text-[9px] leading-4 text-[#817D76]">Required before autonomous PAPER BUYs. SELL de-risking remains allowed.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={automationDraft?.require_walk_forward_validation !== false}
                        onChange={(event) => setAutomationDraft((current) => ({
                          ...(current || {}),
                          require_walk_forward_validation: event.target.checked,
                        }))}
                        className="h-4 w-4 accent-[#1F1E1B]"
                      />
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["Max age hours", "validation_max_age_hours", "1", "8760", "1"],
                        ["Min trades", "validation_min_trades", "0", "10000", "1"],
                        ["Min hit rate", "validation_min_directional_hit_rate", "0", "1", "0.01"],
                        ["Max drawdown %", "validation_max_drawdown_pct", "0", "100", "0.1"],
                        ["Min total return", "validation_min_total_return", "-1", "100", "0.01"],
                      ].map(([label, key, min, max, step]) => (
                        <label key={key} className={key === "validation_min_total_return" ? "col-span-2" : ""}>
                          <span className="text-[8px] text-[#968F86]">{label}</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={automationDraft?.[key] ?? ""}
                            onChange={(event) => setAutomationDraft((current) => ({
                              ...(current || {}),
                              [key]: event.target.value,
                            }))}
                            className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] text-[#2E2B27] outline-none"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                    <label className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Strategy health drift gate</div>
                        <div className="mt-1 text-[9px] leading-4 text-[#817D76]">Uses recent realized PAPER outcomes after walk-forward validation. Material deterioration blocks new autonomous BUYs; SELL de-risking remains available.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={automationDraft?.require_strategy_health_gate !== false}
                        onChange={(event) => setAutomationDraft((current) => ({
                          ...(current || {}),
                          require_strategy_health_gate: event.target.checked,
                        }))}
                        className="h-4 w-4 accent-[#1F1E1B]"
                      />
                    </label>
                    {latestStrategyHealth ? (
                      <div className={`mt-3 rounded-lg border px-2.5 py-2 text-[8px] ${
                        latestStrategyHealth.ready === false
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-100 bg-emerald-50/60 text-emerald-700"
                      }`}>
                        {String(latestStrategyHealth.status || "UNKNOWN").replaceAll("_", " ")}
                        {" · "}
                        {Number(latestStrategyHealth.metrics?.sample_count || 0)} samples
                        {" · Brier "}
                        {latestStrategyHealth.metrics?.avg_brier == null ? "—" : Number(latestStrategyHealth.metrics.avg_brier).toFixed(3)}
                        {" · Log loss "}
                        {latestStrategyHealth.metrics?.avg_log_loss == null ? "—" : Number(latestStrategyHealth.metrics.avg_log_loss).toFixed(3)}
                        {" · Hit "}
                        {latestStrategyHealth.metrics?.directional_hit_rate == null ? "—" : `${(Number(latestStrategyHealth.metrics.directional_hit_rate) * 100).toFixed(1)}%`}
                        {" · Excess "}
                        {latestStrategyHealth.metrics?.avg_excess_return == null ? "—" : `${(Number(latestStrategyHealth.metrics.avg_excess_return) * 100).toFixed(2)}%`}
                      </div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["Min mature samples", "strategy_health_min_samples", "5", "500", "1"],
                        ["Max Brier", "strategy_health_max_brier", "0.01", "1", "0.01"],
                        ["Max log loss", "strategy_health_max_log_loss", "0.01", "10", "0.01"],
                        ["Min hit rate", "strategy_health_min_directional_hit_rate", "0", "1", "0.01"],
                        ["Min avg excess return", "strategy_health_min_avg_excess_return", "-1", "1", "0.001"],
                      ].map(([label, key, min, max, step]) => (
                        <label key={key} className={key === "strategy_health_min_avg_excess_return" ? "col-span-2" : ""}>
                          <span className="text-[8px] text-[#968F86]">{label}</span>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={automationDraft?.[key] ?? ""}
                            onChange={(event) => setAutomationDraft((current) => ({
                              ...(current || {}),
                              [key]: event.target.value,
                            }))}
                            className="mt-1 h-8 w-full rounded-lg border border-black/[0.09] bg-white px-2 text-[9px] text-[#2E2B27] outline-none"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  </div>
                  </details>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => act("UPDATE_AUTOMATION_POLICY", {
                        cycle_interval_seconds: Number(automationDraft?.cycle_interval_seconds || 300),
                        target_position_pct: Number(automationDraft?.target_position_pct || 2),
                        target_annualized_volatility_pct: Number(automationDraft?.target_annualized_volatility_pct || 25),
                        min_confidence: Number(automationDraft?.min_confidence || 0.75),
                        max_trades_per_cycle: Number(automationDraft?.max_trades_per_cycle || 3),
                        cooldown_minutes: Number(automationDraft?.cooldown_minutes || 60),
                        require_walk_forward_validation: automationDraft?.require_walk_forward_validation !== false,
                        validation_max_age_hours: Number(automationDraft?.validation_max_age_hours || 168),
                        validation_min_trades: Number(automationDraft?.validation_min_trades ?? 5),
                        validation_min_directional_hit_rate: Number(automationDraft?.validation_min_directional_hit_rate ?? 0.5),
                        validation_max_drawdown_pct: Number(automationDraft?.validation_max_drawdown_pct ?? 25),
                        validation_min_total_return: Number(automationDraft?.validation_min_total_return ?? 0),
                        require_strategy_health_gate: automationDraft?.require_strategy_health_gate !== false,
                        strategy_health_min_samples: Number(automationDraft?.strategy_health_min_samples ?? 20),
                        strategy_health_max_brier: Number(automationDraft?.strategy_health_max_brier ?? 0.30),
                        strategy_health_max_log_loss: Number(automationDraft?.strategy_health_max_log_loss ?? 0.90),
                        strategy_health_min_directional_hit_rate: Number(automationDraft?.strategy_health_min_directional_hit_rate ?? 0.45),
                        strategy_health_min_avg_excess_return: Number(automationDraft?.strategy_health_min_avg_excess_return ?? -0.01),
                      })}
                      className="h-8 rounded-xl border border-[#CDAA78]/20 bg-white px-3 text-[9px] font-medium text-[#655B51] transition hover:border-[#B98B54]/35 hover:bg-[#FBF7F1] disabled:opacity-40"
                    >
                      Save limits
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(working) || automationPolicy.kill_switch || automationPolicy.circuit_breaker_latched}
                      onClick={() => act("UPDATE_AUTOMATION_POLICY", {
                        auto_paper_enabled: !automationPolicy.auto_paper_enabled,
                      })}
                      className="h-8 rounded-xl bg-[#2B2723] px-3 text-[9px] font-medium text-white shadow-[0_5px_14px_rgba(43,39,35,0.12)] transition hover:bg-[#1F1C19] disabled:opacity-40"
                    >
                      {automationPolicy.auto_paper_enabled ? "Disable autopilot" : "Enable paper autopilot"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => act("UPDATE_AUTOMATION_POLICY", {
                        kill_switch: !automationPolicy.kill_switch,
                        auto_paper_enabled: automationPolicy.kill_switch
                          ? automationPolicy.auto_paper_enabled
                          : false,
                      })}
                      className={`h-8 rounded-lg px-2.5 text-[9px] font-medium ${
                        automationPolicy.kill_switch
                          ? "border border-black/[0.08] bg-[#FCFBF9] text-[#5E5851]"
                          : "border border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {automationPolicy.kill_switch ? "Reset kill switch" : "Kill switch"}
                    </button>
                    {automationPolicy.circuit_breaker_latched ? (
                      <button
                        type="button"
                        disabled={Boolean(working)}
                        onClick={() => act("RESET_PORTFOLIO_CIRCUIT_BREAKER")}
                        className="h-8 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[9px] font-medium text-red-700 disabled:opacity-40"
                      >
                        {working === "RESET_PORTFOLIO_CIRCUIT_BREAKER" ? "Resetting…" : "Reset circuit breaker"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={Boolean(working) || ((!automationPolicy.auto_paper_enabled || automationPolicy.kill_switch) && !automationPolicy.circuit_breaker_latched)}
                      onClick={() => act("RUN_AUTONOMOUS_PAPER_CYCLE")}
                      className="h-8 rounded-lg border border-[#D6A66A]/35 bg-[#FBF7F1] px-2.5 text-[9px] font-medium text-[#8A6239] disabled:opacity-40"
                    >
                      {working === "RUN_AUTONOMOUS_PAPER_CYCLE"
                        ? "Running…"
                        : automationPolicy.circuit_breaker_latched
                          ? "Continue liquidation"
                          : "Run cycle now"}
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl border border-[#CDAA78]/15 bg-white/75 px-3 py-2.5 text-[9px] text-[#817D76]">
                    Last run: {automationRuns[0]
                      ? `${automationRuns[0].status} · ${automationRuns[0].orders_filled || 0} fills · ${new Date(automationRuns[0].started_at).toLocaleString()}`
                      : "No autonomous cycle yet"}
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center gap-2 text-[#A37849]"><BrainCircuit size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Agent layer</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Research evidence", evidence.length],
                      ["Specialist theses", theses.length],
                      ["Governed decisions", decisions.length],
                      ["Active paper orders", orders.filter((row) => ["QUEUED", "PARTIALLY_FILLED"].includes(row.status)).length],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {["TECHNICAL", "QUANT", "NEWS", "FUNDAMENTAL"].map((agentType) => {
                      const performance = agentPerformance.find((row) => row.agent_type === agentType);
                      return (
                        <div key={agentType} className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-[#FCFBF9] px-2.5 py-2">
                          <div>
                            <div className="text-[8px] font-medium text-[#5E5851]">{agentType}</div>
                            <div className="mt-0.5 text-[8px] text-[#9A968E]">{Number(performance?.sample_count || 0)} matured samples</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] font-semibold">{Number(performance?.reliability_weight || 1).toFixed(2)}×</div>
                            <div className="mt-0.5 text-[8px] text-[#9A968E]">
                              {performance?.directional_hit_rate == null ? "neutral prior" : `${(Number(performance.directional_hit_rate) * 100).toFixed(1)}% hit`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[8px] leading-4 text-[#9A968E]">
                    Reliability changes reasoning influence only. It cannot increase execution authority or bypass risk controls.
                  </div>
                </div>

                <div id="markets-performance" className="scroll-mt-24 rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center gap-2 text-[#A37849]"><Activity size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Portfolio performance</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Paper equity curve</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Daily observations", Number(portfolioPerformance.daily_observation_count || 0)],
                      ["Total return", portfolioPerformance.total_return == null ? "—" : `${(Number(portfolioPerformance.total_return) * 100).toFixed(2)}%`],
                      ["Annualized return", portfolioPerformance.annualized_return == null ? "—" : `${(Number(portfolioPerformance.annualized_return) * 100).toFixed(2)}%`],
                      ["Annualized vol", portfolioPerformance.annualized_volatility == null ? "—" : `${(Number(portfolioPerformance.annualized_volatility) * 100).toFixed(2)}%`],
                      ["Max drawdown", portfolioPerformance.max_drawdown_pct == null ? "—" : `${Number(portfolioPerformance.max_drawdown_pct).toFixed(2)}%`],
                      ["Positive days", portfolioPerformance.positive_day_rate == null ? "—" : `${(Number(portfolioPerformance.positive_day_rate) * 100).toFixed(1)}%`],
                      ["Sharpe", portfolioPerformance.sharpe_ratio == null ? "—" : Number(portfolioPerformance.sharpe_ratio).toFixed(2)],
                      ["Sortino", portfolioPerformance.sortino_ratio == null ? "—" : Number(portfolioPerformance.sortino_ratio).toFixed(2)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[9px] leading-4 text-[#8A867F]">
                    {portfolioPerformance.risk_adjusted_history_sufficient
                      ? "Risk-adjusted statistics use the append-only daily paper-equity curve. Current risk-free input is 0% until a governed macro rate feed is wired."
                      : `Sharpe and Sortino remain hidden until at least ${Number(portfolioPerformance.minimum_risk_adjusted_observations || 20)} daily return observations exist.`}
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center gap-2 text-[#A37849]"><Activity size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Execution quality</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Paper execution friction</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Fill slices", Number(executionQuality.sample_count || 0)],
                      ["Fill notional", money(executionQuality.fill_notional || 0, baseCurrency)],
                      ["Avg spread", executionQuality.avg_spread_bps == null ? "—" : `${Number(executionQuality.avg_spread_bps).toFixed(2)} bps`],
                      ["Top-of-book slip", executionQuality.avg_top_of_book_slippage_bps == null ? "—" : `${Number(executionQuality.avg_top_of_book_slippage_bps).toFixed(2)} bps`],
                      ["Impl. shortfall", executionQuality.avg_implementation_shortfall_bps == null ? "—" : `${Number(executionQuality.avg_implementation_shortfall_bps).toFixed(2)} bps`],
                      ["Total exec cost", executionQuality.avg_total_execution_cost_bps == null ? "—" : `${Number(executionQuality.avg_total_execution_cost_bps).toFixed(2)} bps`],
                      ["Liquidity participation", executionQuality.avg_displayed_liquidity_participation == null ? "—" : `${(Number(executionQuality.avg_displayed_liquidity_participation) * 100).toFixed(1)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[9px] leading-4 text-[#8A867F]">
                    Metrics are notional-weighted from durable PAPER fill evidence. They measure simulation friction and never increase trading authority.
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center gap-2 text-[#A37849]"><TrendingUp size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Prediction calibration</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Measured outcomes</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Evaluated", outcomes.length],
                      ["Directional hit", hitRate === null ? "—" : `${hitRate.toFixed(1)}%`],
                      ["Avg Brier", averageBrier === null ? "—" : averageBrier.toFixed(4)],
                      ["Avg log loss", averageLogLoss === null ? "—" : averageLogLoss.toFixed(4)],
                      ["Benchmark samples", benchmarkOutcomes.length],
                      ["Avg benchmark", averageBenchmarkReturn === null ? "—" : `${(averageBenchmarkReturn * 100).toFixed(2)}%`],
                      ["Avg excess", averageExcessReturn === null ? "—" : `${(averageExcessReturn * 100).toFixed(2)}%`],
                      ["Beat benchmark", benchmarkOutperformanceRate === null ? "—" : `${benchmarkOutperformanceRate.toFixed(1)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[9px] leading-4 text-[#8A867F]">
                    Confidence is scored against realized market outcomes. High-confidence mistakes receive a larger calibration penalty. Excess return compares the same forecast interval against the configured benchmark.
                  </div>
                  <div className="mt-3 border-t border-black/[0.06] pt-3">
                    <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Portfolio benchmark</div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={benchmarkDraft}
                        onChange={(event) => setBenchmarkDraft(event.target.value.toUpperCase())}
                        placeholder="SPY"
                        className="h-8 min-w-0 flex-1 rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-2.5 text-[10px] uppercase text-[#2E2B27] outline-none"
                      />
                      <button
                        type="button"
                        disabled={Boolean(working)}
                        onClick={() => act("UPDATE_PORTFOLIO_BENCHMARK", {
                          benchmark_symbol: benchmarkDraft,
                        })}
                        className="h-8 rounded-xl bg-[#2B2723] px-3 text-[9px] font-medium text-white shadow-[0_5px_14px_rgba(43,39,35,0.12)] transition hover:bg-[#1F1C19] disabled:opacity-40"
                      >
                        {working === "UPDATE_PORTFOLIO_BENCHMARK" ? "Saving…" : "Save"}
                      </button>
                    </div>
                    <div className="mt-1.5 text-[8px] text-[#9A968E]">
                      Current benchmark: {portfolio?.benchmark_symbol || "SPY"}
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] p-4 shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
                  <div className="flex items-center gap-2 text-[#A37849]"><TrendingUp size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Walk-forward validation</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Out-of-sample evidence</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Completed runs", completedBacktests.length],
                      ["Latest symbol", latestBacktest?.symbol || "—"],
                      ["Latest return", latestBacktest?.status === "COMPLETED" ? `${(Number(latestBacktest.total_return || 0) * 100).toFixed(1)}%` : "—"],
                      ["Latest drawdown", latestBacktest?.status === "COMPLETED" ? `${Number(latestBacktest.max_drawdown_pct || 0).toFixed(1)}%` : "—"],
                      ["Latest trades", latestBacktest?.status === "COMPLETED" ? Number(latestBacktest.trade_count || 0) : "—"],
                      ["Directional hit", latestBacktest?.directional_hit_rate == null ? "—" : `${(Number(latestBacktest.directional_hit_rate) * 100).toFixed(1)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#CDAA78]/15 bg-white/75 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[9px] leading-4 text-[#8A867F]">
                    Signals see only prior bars; simulated execution occurs on the next open with transaction costs. Validation never grants live authority.
                  </div>
                </div>
              </div>
            </section>

            <section id="markets-execution" className="scroll-mt-24 rounded-[22px] border border-[#CDAA78]/20 bg-[#FFFDF9] shadow-[0_14px_42px_rgba(73,55,35,0.055)]">
              <div className="flex items-center justify-between border-b border-[#CDAA78]/15 p-4">
                <div>
                  <div className="flex items-center gap-2 text-[#A37849]"><Activity size={14} /><span className="text-[9px] uppercase tracking-[0.16em]">Execution ledger</span></div>
                  <h2 className="mt-1 text-[18px] font-semibold">Paper orders</h2>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#CDAA78]/20 bg-[#FBF7F1] px-2.5 py-1 text-[8px] font-medium text-[#7B654A]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B98B54]" />
                  Simulation only
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[10px]">
                  <thead className="bg-[#FBF7F1] text-[#766E65]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Side</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Filled / Remaining</th>
                      <th className="px-4 py-3 font-medium">Requested</th>
                      <th className="px-4 py-3 font-medium">Avg fill</th>
                      <th className="px-4 py-3 font-medium">TIF</th>
                      <th className="px-4 py-3 font-medium">Expiry</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {orders.length ? orders.map((order) => (
                      <tr key={order.id} className="transition hover:bg-[#FBF7F1]/70">
                        <td className="px-4 py-3 text-[#8A867F]">{new Date(order.submitted_at).toLocaleString()}</td>
                        <td className="px-4 py-3 font-semibold">{order.symbol}</td>
                        <td className="px-4 py-3">{order.side}</td>
                        <td className="px-4 py-3">{order.quantity}</td>
                        <td className="px-4 py-3">
                          {Number(order.filled_quantity || 0).toFixed(4)} / {Number(order.remaining_quantity ?? order.quantity ?? 0).toFixed(4)}
                        </td>
                        <td className="px-4 py-3">{money(order.requested_price, baseCurrency)}</td>
                        <td className="px-4 py-3">
                          {order.filled_price == null ? "—" : money(order.filled_price, baseCurrency)}
                        </td>
                        <td className="px-4 py-3">{order.time_in_force || "DAY"}</td>
                        <td className="px-4 py-3 text-[#8A867F]">
                          {order.expires_at ? new Date(order.expires_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className={
                            order.status === "FILLED"
                              ? "inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700"
                              : order.status === "CANCELLED" || order.status === "EXPIRED"
                                ? "inline-flex rounded-full bg-red-50 px-2 py-1 text-[8px] font-semibold text-red-700"
                                : order.status === "PARTIALLY_FILLED"
                                  ? "inline-flex rounded-full bg-amber-50 px-2 py-1 text-[8px] font-semibold text-amber-700"
                                  : "inline-flex rounded-full bg-[#F2EEE8] px-2 py-1 text-[8px] font-semibold text-[#766E65]"
                          }>
                            {order.status}
                          </div>
                          {order.lifecycle_reason ? (
                            <div className="mt-1 max-w-[220px] text-[8px] leading-3 text-[#9A968E]">{order.lifecycle_reason}</div>
                          ) : null}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={10} className="px-4 py-10 text-center text-[#9A968E]">No paper orders yet. Orders can only be submitted after a governed decision passes risk.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[18px] border border-[#CDAA78]/20 bg-[#FFFDF9] px-4 py-3 text-[9px] leading-4 text-[#746B61] shadow-[0_8px_24px_rgba(73,55,35,0.035)]">
              <TrendingUp size={13} className="mr-2 inline text-[#A37849]" />
              Markets v1 records probabilistic research and simulated execution. It does not claim certainty, and no live broker mutation path exists.
            </section>
          </>
        )}
      </div>
    </main>
  );
}
