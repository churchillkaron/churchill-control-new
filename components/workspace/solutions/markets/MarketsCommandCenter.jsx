"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, BrainCircuit, LoaderCircle, Plus, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function money(value, currency = "USD") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(number);
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
    const policy = data?.automationPolicy;
    if (!policy) return;
    setAutomationDraft({
      cycle_interval_seconds: String(policy.cycle_interval_seconds ?? 300),
      target_position_pct: String(policy.target_position_pct ?? 2),
      min_confidence: String(policy.min_confidence ?? 0.75),
      max_trades_per_cycle: String(policy.max_trades_per_cycle ?? 3),
      cooldown_minutes: String(policy.cooldown_minutes ?? 60),
      require_walk_forward_validation: policy.require_walk_forward_validation !== false,
      validation_max_age_hours: String(policy.validation_max_age_hours ?? 168),
      validation_min_trades: String(policy.validation_min_trades ?? 5),
      validation_min_directional_hit_rate: String(policy.validation_min_directional_hit_rate ?? 0.5),
      validation_max_drawdown_pct: String(policy.validation_max_drawdown_pct ?? 25),
      validation_min_total_return: String(policy.validation_min_total_return ?? 0),
    });
  }, [data?.automationPolicy]);

  useEffect(() => {
    const policy = data?.riskPolicy;
    if (!policy) return;
    setRiskDraft({
      max_position_pct: String(policy.max_position_pct ?? 10),
      max_sector_pct: String(policy.max_sector_pct ?? 30),
      max_gross_exposure_pct: String(policy.max_gross_exposure_pct ?? 100),
      max_correlated_exposure_pct: String(policy.max_correlated_exposure_pct ?? 35),
      correlation_threshold: String(policy.correlation_threshold ?? 0.8),
      max_daily_loss_pct: String(policy.max_daily_loss_pct ?? 2),
      max_portfolio_drawdown_pct: String(policy.max_portfolio_drawdown_pct ?? 10),
      min_decision_confidence: String(policy.min_decision_confidence ?? 0.7),
      max_order_notional: policy.max_order_notional == null ? "" : String(policy.max_order_notional),
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
  const policy = data?.riskPolicy || {};
  const latestBacktest = backtestRuns[0] || null;
  const completedBacktests = backtestRuns.filter((row) => row.status === "COMPLETED");
  const latestPortfolioRisk = orders
    .map((row) => row?.risk_snapshot?.portfolio_concentration)
    .find((row) => row && Object.keys(row).length) || null;
  const baseCurrency = portfolio?.base_currency || paperAccount?.base_currency || "USD";

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
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#191919] md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1760px] space-y-5">
        <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.045)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#A37849]">Avantiqo Markets · Paper Lab</div>
              <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.045em]">Autonomous market intelligence, governed execution.</h1>
              <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[#706B64]">
                Research, specialist theses, probabilistic decisions and deterministic risk control. Live broker execution is disabled in v1.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-black/[0.07] bg-[#FCFBF9] px-3 py-2">
                <div className="text-[8px] uppercase tracking-[0.14em] text-[#968F86]">Live feed</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-[#4E4A44]">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    feedStatus?.connection_state === "CONNECTED"
                      ? "bg-emerald-500"
                      : feedStatus?.connection_state === "DEGRADED" || feedStatus?.connection_state === "CONNECTING"
                        ? "bg-amber-500"
                        : "bg-[#A09A91]"
                  }`} />
                  {feedStatus?.connection_state || "NOT STARTED"}
                </div>
                <div className="mt-0.5 text-[8px] text-[#9A968E]">
                  {feedStatus?.last_message_at
                    ? `Last message ${new Date(feedStatus.last_message_at).toLocaleTimeString()}`
                    : "No streaming message yet"}
                </div>
              </div>
              <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[11px] font-medium text-white disabled:opacity-40">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
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

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Portfolio", portfolio.name, portfolio.execution_mode],
                ["Watchlist", watchlist.length, "Tracked instruments"],
                ["Evidence", evidence.length, "Recent evidence events"],
                ["Decisions", decisions.length, "Governed decisions"],
                ["Paper orders", orders.length, "Simulation only"],
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                  <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#817D76]">{label}</div>
                  <div className="mt-3 truncate text-xl font-semibold">{value}</div>
                  <div className="mt-1 text-[10px] text-[#8A867F]">{detail}</div>
                </div>
              ))}
            </section>

            <section className="rounded-[22px] border border-black/[0.075] bg-white">
              <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#A37849]">Paper portfolio</div>
                  <h2 className="mt-1 text-[18px] font-semibold">Simulation account & positions</h2>
                </div>
                <button
                  type="button"
                  onClick={() => act("PROCESS_PAPER_ORDERS")}
                  disabled={Boolean(working) || !orders.some((row) => row.status === "QUEUED")}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1F1E1B] px-3 text-[10px] font-medium text-white disabled:opacity-35"
                >
                  <Activity size={12} />
                  {working === "PROCESS_PAPER_ORDERS" ? "Processing…" : "Process paper orders"}
                </button>
              </div>

              <div className="grid gap-2 border-b border-black/[0.06] p-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["Equity", paperAccount ? money(paperAccount.equity, baseCurrency) : "—"],
                  ["Cash", paperAccount ? money(paperAccount.cash_balance, baseCurrency) : "—"],
                  ["Realized P&L", paperAccount ? money(paperAccount.realized_pnl, baseCurrency) : "—"],
                  ["Unrealized P&L", paperAccount ? money(paperAccount.unrealized_pnl, baseCurrency) : "—"],
                  ["Positions", paperPositions.filter((row) => Number(row.quantity || 0) > 0).length],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
                    <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                    <div className="mt-1 text-[14px] font-semibold">{value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[10px]">
                  <thead className="text-[#8A867F]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Average</th>
                      <th className="px-4 py-3 font-medium">Market</th>
                      <th className="px-4 py-3 font-medium">Value</th>
                      <th className="px-4 py-3 font-medium">Unrealized</th>
                      <th className="px-4 py-3 font-medium">Realized</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {paperPositions.filter((row) => Number(row.quantity || 0) > 0).length ? (
                      paperPositions.filter((row) => Number(row.quantity || 0) > 0).map((position) => (
                        <tr key={position.id}>
                          <td className="px-4 py-3 font-semibold">{position.symbol}</td>
                          <td className="px-4 py-3">{position.quantity}</td>
                          <td className="px-4 py-3">{position.average_entry_price ? money(position.average_entry_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{position.market_price ? money(position.market_price, baseCurrency) : "—"}</td>
                          <td className="px-4 py-3">{money(position.market_value, baseCurrency)}</td>
                          <td className="px-4 py-3">{money(position.unrealized_pnl, baseCurrency)}</td>
                          <td className="px-4 py-3">{money(position.realized_pnl, baseCurrency)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[#9A968E]">
                          No paper positions yet. Only risk-approved simulated fills appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-black/[0.06] px-4 py-2.5 text-[9px] text-[#8A867F]">
                {paperFills.length} simulated fill{paperFills.length === 1 ? "" : "s"} recorded · no live broker execution
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[22px] border border-black/[0.075] bg-white">
                <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[#A37849]">Universe</div>
                    <h2 className="mt-1 text-[18px] font-semibold">Watchlist & latest decisions</h2>
                  </div>
                  <form onSubmit={addWatchlist} className="flex gap-2">
                    <input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Ticker e.g. AAPL" className="h-9 w-40 rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-3 text-[11px] uppercase text-[#2E2B27] outline-none placeholder:normal-case placeholder:text-[#AAA69E]" />
                    <button type="submit" disabled={working === "ADD_WATCHLIST"} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[10px] font-medium text-white disabled:opacity-40">
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
                      <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(120px,1fr)_auto_auto_auto_minmax(250px,auto)] sm:items-center">
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
                          <div className="mt-1 text-[11px] font-medium">{decision?.action || "NO DECISION"}</div>
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
                                className="inline-flex h-8 items-center rounded-lg bg-[#1F1E1B] px-2.5 text-[9px] font-medium text-white disabled:opacity-40"
                              >
                                Queue {decision.action}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  }) : <div className="p-8 text-center text-[11px] text-[#8A867F]">Add the first instrument to start the research universe.</div>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[22px] border border-black/[0.075] bg-white p-4">
                  <div className="flex items-center gap-2 text-[#A37849]"><ShieldCheck size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Risk authority</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Independent execution limits</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["Max position", `${Number(policy.max_position_pct || 10)}%`],
                      ["Sector cap", `${Number(policy.max_sector_pct || 30)}%`],
                      ["Gross exposure", `${Number(policy.max_gross_exposure_pct || 100)}%`],
                      ["Correlated cap", `${Number(policy.max_correlated_exposure_pct || 35)}%`],
                      ["Correlation gate", Number(policy.correlation_threshold || 0.8).toFixed(2)],
                      ["Daily loss", `${Number(policy.max_daily_loss_pct || 2)}%`],
                      ["Max drawdown", `${Number(policy.max_portfolio_drawdown_pct || 10)}%`],
                      ["Min confidence", `${(Number(policy.min_decision_confidence || 0.7) * 100).toFixed(0)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
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
                        <div className="text-[#9A968E]">Correlated</div>
                        <div className="mt-0.5 font-semibold">
                          {latestPortfolioRisk ? `${Number(latestPortfolioRisk.projected_correlated_exposure_pct || 0).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    </div>
                    {latestPortfolioRisk?.candidate_sector ? (
                      <div className="mt-2 text-[8px] text-[#9A968E]">
                        Last evaluated sector: {latestPortfolioRisk.candidate_sector}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 border-t border-black/[0.06] pt-3">
                    <div className="mb-2 text-[8px] uppercase tracking-[0.12em] text-[#968F86]">Owner policy controls</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Position %", "max_position_pct", "0.1", "100", "0.1"],
                        ["Sector %", "max_sector_pct", "0.1", "100", "0.1"],
                        ["Gross %", "max_gross_exposure_pct", "0.1", "300", "0.1"],
                        ["Correlated %", "max_correlated_exposure_pct", "0.1", "100", "0.1"],
                        ["Correlation", "correlation_threshold", "0", "1", "0.01"],
                        ["Daily loss %", "max_daily_loss_pct", "0.1", "100", "0.1"],
                        ["Drawdown %", "max_portfolio_drawdown_pct", "0.1", "100", "0.1"],
                        ["Min confidence", "min_decision_confidence", "0", "1", "0.01"],
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
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => act("UPDATE_RISK_POLICY", {
                        max_position_pct: Number(riskDraft?.max_position_pct || 10),
                        max_sector_pct: Number(riskDraft?.max_sector_pct || 30),
                        max_gross_exposure_pct: Number(riskDraft?.max_gross_exposure_pct || 100),
                        max_correlated_exposure_pct: Number(riskDraft?.max_correlated_exposure_pct || 35),
                        correlation_threshold: Number(riskDraft?.correlation_threshold ?? 0.8),
                        max_daily_loss_pct: Number(riskDraft?.max_daily_loss_pct || 2),
                        max_portfolio_drawdown_pct: Number(riskDraft?.max_portfolio_drawdown_pct || 10),
                        min_decision_confidence: Number(riskDraft?.min_decision_confidence ?? 0.7),
                        max_order_notional: riskDraft?.max_order_notional ?? "",
                      })}
                      className="mt-3 h-8 rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-medium text-white disabled:opacity-40"
                    >
                      {working === "UPDATE_RISK_POLICY" ? "Saving…" : "Save risk policy"}
                    </button>
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50 px-3 py-2.5 text-[10px] text-emerald-700">
                    Live broker execution: <span className="font-semibold">DISABLED</span>
                  </div>
                </div>

                <div className="rounded-[22px] border border-black/[0.075] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[#A37849]"><Activity size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Paper autopilot</span></div>
                    <div className={`rounded-full px-2.5 py-1 text-[8px] font-medium ${
                      automationPolicy.kill_switch
                        ? "bg-red-50 text-red-700"
                        : automationPolicy.auto_paper_enabled
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-[#F3F1ED] text-[#817D76]"
                    }`}>
                      {automationPolicy.kill_switch
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

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Cycle seconds", "cycle_interval_seconds", "60", "86400", "1"],
                      ["Target position %", "target_position_pct", "0.1", "10", "0.1"],
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

                  <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
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

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={Boolean(working)}
                      onClick={() => act("UPDATE_AUTOMATION_POLICY", {
                        cycle_interval_seconds: Number(automationDraft?.cycle_interval_seconds || 300),
                        target_position_pct: Number(automationDraft?.target_position_pct || 2),
                        min_confidence: Number(automationDraft?.min_confidence || 0.75),
                        max_trades_per_cycle: Number(automationDraft?.max_trades_per_cycle || 3),
                        cooldown_minutes: Number(automationDraft?.cooldown_minutes || 60),
                        require_walk_forward_validation: automationDraft?.require_walk_forward_validation !== false,
                        validation_max_age_hours: Number(automationDraft?.validation_max_age_hours || 168),
                        validation_min_trades: Number(automationDraft?.validation_min_trades ?? 5),
                        validation_min_directional_hit_rate: Number(automationDraft?.validation_min_directional_hit_rate ?? 0.5),
                        validation_max_drawdown_pct: Number(automationDraft?.validation_max_drawdown_pct ?? 25),
                        validation_min_total_return: Number(automationDraft?.validation_min_total_return ?? 0),
                      })}
                      className="h-8 rounded-lg border border-black/[0.08] bg-[#FCFBF9] px-2.5 text-[9px] font-medium text-[#5E5851] disabled:opacity-40"
                    >
                      Save limits
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(working) || automationPolicy.kill_switch}
                      onClick={() => act("UPDATE_AUTOMATION_POLICY", {
                        auto_paper_enabled: !automationPolicy.auto_paper_enabled,
                      })}
                      className="h-8 rounded-lg bg-[#1F1E1B] px-2.5 text-[9px] font-medium text-white disabled:opacity-40"
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
                    <button
                      type="button"
                      disabled={Boolean(working) || !automationPolicy.auto_paper_enabled || automationPolicy.kill_switch}
                      onClick={() => act("RUN_AUTONOMOUS_PAPER_CYCLE")}
                      className="h-8 rounded-lg border border-[#D6A66A]/35 bg-[#FBF7F1] px-2.5 text-[9px] font-medium text-[#8A6239] disabled:opacity-40"
                    >
                      {working === "RUN_AUTONOMOUS_PAPER_CYCLE" ? "Running…" : "Run cycle now"}
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl border border-black/[0.06] bg-[#FCFBF9] px-3 py-2.5 text-[9px] text-[#817D76]">
                    Last run: {automationRuns[0]
                      ? `${automationRuns[0].status} · ${automationRuns[0].orders_filled || 0} fills · ${new Date(automationRuns[0].started_at).toLocaleString()}`
                      : "No autonomous cycle yet"}
                  </div>
                </div>

                <div className="rounded-[22px] border border-black/[0.075] bg-white p-4">
                  <div className="flex items-center gap-2 text-[#A37849]"><BrainCircuit size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Agent layer</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Research evidence", evidence.length],
                      ["Specialist theses", theses.length],
                      ["Governed decisions", decisions.length],
                      ["Queued paper orders", orders.filter((row) => row.status === "QUEUED").length],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
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

                <div className="rounded-[22px] border border-black/[0.075] bg-white p-4">
                  <div className="flex items-center gap-2 text-[#A37849]"><TrendingUp size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Prediction calibration</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Measured outcomes</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Evaluated", outcomes.length],
                      ["Directional hit", hitRate === null ? "—" : `${hitRate.toFixed(1)}%`],
                      ["Avg Brier", averageBrier === null ? "—" : averageBrier.toFixed(4)],
                      ["Avg log loss", averageLogLoss === null ? "—" : averageLogLoss.toFixed(4)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-[#968F86]">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[9px] leading-4 text-[#8A867F]">
                    Confidence is scored against realized market outcomes. High-confidence mistakes receive a larger calibration penalty.
                  </div>
                </div>

                <div className="rounded-[22px] border border-black/[0.075] bg-white p-4">
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
                      <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3">
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

            <section className="rounded-[22px] border border-black/[0.075] bg-white">
              <div className="flex items-center justify-between border-b border-black/[0.06] p-4">
                <div>
                  <div className="flex items-center gap-2 text-[#A37849]"><Activity size={14} /><span className="text-[9px] uppercase tracking-[0.16em]">Execution ledger</span></div>
                  <h2 className="mt-1 text-[18px] font-semibold">Paper orders</h2>
                </div>
                <div className="rounded-full border border-black/[0.08] bg-[#FCFBF9] px-2.5 py-1 text-[9px] text-[#817D76]">Simulation only</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[10px]">
                  <thead className="text-[#8A867F]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Side</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Requested</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {orders.length ? orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3 text-[#8A867F]">{new Date(order.submitted_at).toLocaleString()}</td>
                        <td className="px-4 py-3 font-semibold">{order.symbol}</td>
                        <td className="px-4 py-3">{order.side}</td>
                        <td className="px-4 py-3">{order.quantity}</td>
                        <td className="px-4 py-3">{money(order.requested_price, baseCurrency)}</td>
                        <td className="px-4 py-3">{order.status}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-[#9A968E]">No paper orders yet. Orders can only be submitted after a governed decision passes risk.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[18px] border border-[#D6A66A]/25 bg-[#FBF7F1] px-4 py-3 text-[10px] leading-4 text-[#706B64]">
              <TrendingUp size={13} className="mr-2 inline text-[#A37849]" />
              Markets v1 records probabilistic research and simulated execution. It does not claim certainty, and no live broker mutation path exists.
            </section>
          </>
        )}
      </div>
    </main>
  );
}
