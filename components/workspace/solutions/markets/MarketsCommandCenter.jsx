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

  const portfolio = data?.portfolio;
  const watchlist = Array.isArray(data?.watchlist) ? data.watchlist : [];
  const decisions = Array.isArray(data?.decisions) ? data.decisions : [];
  const orders = Array.isArray(data?.paperOrders) ? data.paperOrders : [];
  const evidence = Array.isArray(data?.evidence) ? data.evidence : [];
  const theses = Array.isArray(data?.theses) ? data.theses : [];
  const policy = data?.riskPolicy || {};
  const baseCurrency = portfolio?.base_currency || "USD";

  const latestBySymbol = new Map();
  for (const row of decisions) {
    if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
  }

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#080808] p-6 text-white">
        <div className="flex min-h-[420px] items-center justify-center text-sm text-white/60">
          <LoaderCircle size={18} className="mr-2 animate-spin" /> Loading Avantiqo Markets…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080808] p-4 text-white md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1760px] space-y-5">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#D6A66A]">Avantiqo Markets · Paper Lab</div>
              <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.045em]">Autonomous market intelligence, governed execution.</h1>
              <p className="mt-2 max-w-4xl text-[12px] leading-5 text-white/55">
                Research, specialist theses, probabilistic decisions and deterministic risk control. Live broker execution is disabled in v1.
              </p>
            </div>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[11px] text-white/80 disabled:opacity-40">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-[11px] text-red-200">
            <AlertTriangle size={13} className="mr-2 inline" />{error}
          </div>
        ) : null}

        {!portfolio ? (
          <section className="rounded-[24px] border border-[#D6A66A]/25 bg-[#D6A66A]/[0.06] p-8">
            <div className="max-w-2xl">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#D6A66A]">First activation</div>
              <h2 className="mt-2 text-2xl font-semibold">Create the governed paper portfolio.</h2>
              <p className="mt-2 text-[12px] leading-5 text-white/55">This creates the portfolio and its independent risk policy. No real-money execution path is created.</p>
              <button type="button" disabled={working === "INITIALIZE"} onClick={() => act("INITIALIZE")} className="mt-5 rounded-xl bg-[#D6A66A] px-4 py-2.5 text-[11px] font-semibold text-black disabled:opacity-40">
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
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="text-[9px] uppercase tracking-[0.16em] text-white/40">{label}</div>
                  <div className="mt-3 truncate text-xl font-semibold">{value}</div>
                  <div className="mt-1 text-[10px] text-white/35">{detail}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03]">
                <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[#D6A66A]">Universe</div>
                    <h2 className="mt-1 text-[18px] font-semibold">Watchlist & latest decisions</h2>
                  </div>
                  <form onSubmit={addWatchlist} className="flex gap-2">
                    <input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Ticker e.g. AAPL" className="h-9 w-40 rounded-lg border border-white/10 bg-black/40 px-3 text-[11px] uppercase outline-none placeholder:normal-case placeholder:text-white/25" />
                    <button type="submit" disabled={working === "ADD_WATCHLIST"} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D6A66A] px-3 text-[10px] font-semibold text-black disabled:opacity-40">
                      <Plus size={12} /> Add
                    </button>
                  </form>
                </div>
                <div className="divide-y divide-white/[0.07]">
                  {watchlist.length ? watchlist.map((item) => {
                    const decision = latestBySymbol.get(item.symbol);
                    return (
                      <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                        <div>
                          <div className="text-[14px] font-semibold">{item.symbol}</div>
                          <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/35">{item.asset_type} · {item.thesis_horizon}</div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Latest decision</div>
                          <div className="mt-1 text-[11px] font-medium">{decision?.action || "NO DECISION"}</div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">Confidence</div>
                          <div className="mt-1 text-[11px] font-medium">{decision ? `${(Number(decision.confidence) * 100).toFixed(1)}%` : "—"}</div>
                        </div>
                      </div>
                    );
                  }) : <div className="p-8 text-center text-[11px] text-white/35">Add the first instrument to start the research universe.</div>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-[#D6A66A]"><ShieldCheck size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Risk authority</span></div>
                  <h2 className="mt-2 text-[18px] font-semibold">Independent execution limits</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["Max position", `${Number(policy.max_position_pct || 10)}%`],
                      ["Daily loss", `${Number(policy.max_daily_loss_pct || 2)}%`],
                      ["Max drawdown", `${Number(policy.max_portfolio_drawdown_pct || 10)}%`],
                      ["Min confidence", `${(Number(policy.min_decision_confidence || 0.7) * 100).toFixed(0)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-white/35">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2.5 text-[10px] text-emerald-200">
                    Live broker execution: <span className="font-semibold">DISABLED</span>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-[#D6A66A]"><BrainCircuit size={15} /><span className="text-[9px] uppercase tracking-[0.16em]">Agent layer</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["Research evidence", evidence.length],
                      ["Specialist theses", theses.length],
                      ["Governed decisions", decisions.length],
                      ["Queued paper orders", orders.filter((row) => row.status === "QUEUED").length],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
                        <div className="text-[8px] uppercase tracking-[0.12em] text-white/35">{label}</div>
                        <div className="mt-1 text-[14px] font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[22px] border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <div className="flex items-center gap-2 text-[#D6A66A]"><Activity size={14} /><span className="text-[9px] uppercase tracking-[0.16em]">Execution ledger</span></div>
                  <h2 className="mt-1 text-[18px] font-semibold">Paper orders</h2>
                </div>
                <div className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] text-white/40">Simulation only</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-[10px]">
                  <thead className="text-white/35">
                    <tr>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Symbol</th>
                      <th className="px-4 py-3 font-medium">Side</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium">Requested</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {orders.length ? orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3 text-white/45">{new Date(order.submitted_at).toLocaleString()}</td>
                        <td className="px-4 py-3 font-semibold">{order.symbol}</td>
                        <td className="px-4 py-3">{order.side}</td>
                        <td className="px-4 py-3">{order.quantity}</td>
                        <td className="px-4 py-3">{money(order.requested_price, baseCurrency)}</td>
                        <td className="px-4 py-3">{order.status}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-white/30">No paper orders yet. Orders can only be submitted after a governed decision passes risk.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[18px] border border-[#D6A66A]/15 bg-[#D6A66A]/[0.04] px-4 py-3 text-[10px] leading-4 text-white/45">
              <TrendingUp size={13} className="mr-2 inline text-[#D6A66A]" />
              Markets v1 records probabilistic research and simulated execution. It does not claim certainty, and no live broker mutation path exists.
            </section>
          </>
        )}
      </div>
    </main>
  );
}
