"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function percent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "Unavailable";
}

function points(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "Unavailable";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(2)} pts`;
}

function trendMeaning(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "No trend";
  if (numeric < 0) return "Improving";
  if (numeric > 0) return "Worsening";
  return "Stable";
}

export default function FinanceForecastPortfolioEngine({
  action,
  organizationId,
  onClose,
}) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) {
      setData(null);
      setError("Select an organization to view forecast portfolio performance.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const endpoint = new URL(
        action?.api || "/api/finance/forecast/accuracy/portfolio",
        window.location.origin
      );
      endpoint.searchParams.set("organizationId", organizationId);
      endpoint.searchParams.set("limit", String(action?.historyLimit || 12));

      const response = await fetch(endpoint.toString(), { method: "GET" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast portfolio loading failed");
      }
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError.message || "Forecast portfolio loading failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, action?.historyLimit, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const rows = useMemo(
    () => (Array.isArray(data?.entities) ? data.entities : []),
    [data?.entities]
  );

  const rankedRows = useMemo(
    () => [...rows].sort((left, right) => {
      const leftError = Number(left.rolling_operating_profit_absolute_error_percent);
      const rightError = Number(right.rolling_operating_profit_absolute_error_percent);
      const leftScore = Number.isFinite(leftError) ? leftError : Number.POSITIVE_INFINITY;
      const rightScore = Number.isFinite(rightError) ? rightError : Number.POSITIVE_INFINITY;
      return leftScore - rightScore;
    }),
    [rows]
  );

  function previewReport() {
    if (!data?.document) return;
    window.dispatchEvent(
      new CustomEvent("workspace:preview", {
        detail: {
          action: { ...action, title: "Approved Forecast Accuracy Portfolio" },
          documentType: "FinancialReport",
          payload: { document: data.document },
          organizationId,
          entityId: null,
          periodId: null,
        },
      })
    );
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">Finance Forecasting</div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">Forecast Portfolio</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Organization-wide comparison of approved forecast quality across active legal entities. Monetary values are never combined across currencies; this view compares percentage accuracy, coverage, and trend only.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} disabled={busy} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-50">Refresh</button>
            <button onClick={previewReport} disabled={!data?.document} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-40">Full Report</button>
            <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60">Close</button>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
        {busy && !data ? <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">Loading forecast portfolio...</div> : null}

        {data ? (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Active entities</div><div className="mt-3 text-2xl text-white">{summary.active_entities || 0}</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Final measured</div><div className="mt-3 text-2xl text-white">{summary.entities_with_final_measurement || 0}</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Portfolio revenue error</div><div className="mt-3 text-2xl text-white">{percent(summary.unweighted_mean_rolling_revenue_absolute_error_percent)}</div><div className="mt-2 text-xs text-white/35">Unweighted entity mean</div></div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Portfolio operating profit error</div><div className="mt-3 text-2xl text-white">{percent(summary.unweighted_mean_rolling_operating_profit_absolute_error_percent)}</div><div className="mt-2 text-xs text-white/35">Unweighted entity mean</div></div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><div className="text-[11px] uppercase tracking-[0.20em] text-white/35">Entity ranking</div><div className="mt-2 text-sm text-white/50">Lowest rolling operating-profit absolute error ranks first. Unavailable measurements stay at the bottom.</div></div>
                <div className="text-xs text-white/35">History limit {data.history_limit || 12} per entity</div>
              </div>
              {!rankedRows.length ? <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-5 text-sm text-white/45">No active legal entities are configured.</div> : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-[0.14em] text-white/30"><tr><th className="pb-3 pr-4 font-normal">Entity</th><th className="pb-3 pr-4 font-normal">Currency</th><th className="pb-3 pr-4 font-normal">Final periods</th><th className="pb-3 pr-4 font-normal">Revenue error</th><th className="pb-3 pr-4 font-normal">Operating profit error</th><th className="pb-3 pr-4 font-normal">Revenue trend</th><th className="pb-3 font-normal">Profit trend</th></tr></thead>
                    <tbody>{rankedRows.map(row => <tr key={row.entity_id} className="border-t border-white/[0.06] text-white/60"><td className="py-3 pr-4 text-white/80">{row.entity_name}</td><td className="py-3 pr-4">{row.currency_code || "-"}</td><td className="py-3 pr-4">{row.final_measured_periods || 0}</td><td className="py-3 pr-4">{percent(row.rolling_revenue_absolute_error_percent)}</td><td className="py-3 pr-4">{percent(row.rolling_operating_profit_absolute_error_percent)}</td><td className="py-3 pr-4">{points(row.revenue_absolute_error_change_points)} · {trendMeaning(row.revenue_absolute_error_change_points)}</td><td className="py-3">{points(row.operating_profit_absolute_error_change_points)} · {trendMeaning(row.operating_profit_absolute_error_change_points)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-3 text-xs text-white/40 md:grid-cols-4">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">Approved forecast entities: {summary.entities_with_approved_forecasts || 0}</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">Entities with trend: {summary.entities_with_trend || 0}</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">Measurement errors: {summary.entities_with_measurement_errors || 0}</div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">No cross-currency monetary aggregation</div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
