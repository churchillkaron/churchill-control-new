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
  const policy = data?.riskPolicy || {};
  const baseCurrency = portfolio?.base_currency || paperAccount?.base_currency || "USD";

  const latestBySymbol = new Map();
  for (const row of decisions) {
    if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
  }
  const latestSnapshotBySymbol = new Map();
  for (const row of snapshots) {
    if (!latestSnapshotBySymbol.has(row.symbol)) latestSnapshotBySymbol.set(row.symbol, row);
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
                    const refreshing = working === `REFRESH_INTELLIGENCE:${item.symbol}`;
                    return (
                      <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(120px,1fr)_auto_auto_auto_minmax(250px,auto)] sm:items-center">
                        <div>
                          <div className="text-[14px] font-semibold">{item.symbol}</div>
                          <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#938C83]">{item.asset_type} · {item.thesis_horizon}</div>
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
                  <div className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50 px-3 py-2.5 text-[10px] text-emerald-700">
                    Live broker execution: <span className="font-semibold">DISABLED</span>
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
