"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function percentLabel(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Unavailable"
    : `${Number(value).toFixed(2)}%`;
}

function pointsLabel(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "Unavailable";
  }

  const numeric = Number(value);
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${numeric.toFixed(2)} pts`;
}

function trendMeaning(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "Not enough final history";
  }
  if (Number(value) < 0) return "Accuracy improved";
  if (Number(value) > 0) return "Error increased";
  return "No change";
}

function statusLabel(value) {
  if (value === "final") return "Final";
  if (value === "preliminary") return "Preliminary";
  return "Unavailable";
}

export default function FinanceForecastPerformanceEngine({
  action,
  organizationId,
  entityId,
  onClose,
}) {
  const [dashboard, setDashboard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !entityId) {
      setDashboard(null);
      setError("Select an organization and legal entity to view forecast performance.");
      return;
    }

    try {
      setBusy(true);
      setError("");

      const endpoint = new URL(
        action?.api || "/api/finance/forecast/accuracy/history",
        window.location.origin
      );
      endpoint.searchParams.set("organizationId", organizationId);
      endpoint.searchParams.set("entityId", entityId);
      endpoint.searchParams.set("limit", String(action?.historyLimit || 12));

      const response = await fetch(endpoint.toString(), { method: "GET" });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast performance loading failed");
      }

      setDashboard(json);
    } catch (loadError) {
      setDashboard(null);
      setError(loadError.message || "Forecast performance loading failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, action?.historyLimit, organizationId, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = dashboard?.summary || {};
  const trend = dashboard?.trend || {};
  const history = Array.isArray(dashboard?.history) ? dashboard.history : [];

  const finalHistory = useMemo(
    () => history.filter(row => row?.accuracy_ready && row?.accuracy_status === "final"),
    [history]
  );

  const latestFinal = useMemo(() => {
    const preferredId = summary.latest_final_period_id;
    return finalHistory.find(row => row.period_id === preferredId) || finalHistory[0] || null;
  }, [finalHistory, summary.latest_final_period_id]);

  function previewReport() {
    if (!dashboard?.document) return;

    window.dispatchEvent(
      new CustomEvent("workspace:preview", {
        detail: {
          action: {
            ...action,
            title: "Approved Forecast Accuracy History",
          },
          documentType: "FinancialReport",
          payload: { document: dashboard.document },
          organizationId,
          entityId,
          periodId: null,
        },
      })
    );
  }

  const metricCards = [
    {
      label: "Latest Revenue Error",
      value: percentLabel(latestFinal?.comparisons?.revenue?.absolute_error_percent),
      detail: latestFinal?.period_name || "No final measured period",
    },
    {
      label: "Latest Operating Profit Error",
      value: percentLabel(latestFinal?.comparisons?.operating_profit?.absolute_error_percent),
      detail: latestFinal?.period_name || "No final measured period",
    },
    {
      label: "Rolling Revenue Error",
      value: percentLabel(summary.average_revenue_absolute_error_percent),
      detail: `${summary.final_measured_periods || 0} final measured periods`,
    },
    {
      label: "Rolling Operating Profit Error",
      value: percentLabel(summary.average_operating_profit_absolute_error_percent),
      detail: `${summary.final_measured_periods || 0} final measured periods`,
    },
  ];

  const coverageCards = [
    ["Approved periods", summary.approved_periods || 0],
    ["Final measured", summary.final_measured_periods || 0],
    ["Preliminary", summary.preliminary_periods || 0],
    ["Unavailable", summary.unavailable_periods || 0],
  ];

  const trendCards = [
    {
      label: "Revenue error change",
      value: trend.revenue_absolute_error_change_points,
    },
    {
      label: "Operating profit error change",
      value: trend.operating_profit_absolute_error_change_points,
    },
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
              Finance Forecasting
            </div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">
              Forecast Performance
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Management view of approved forecast accuracy. Only final closed or locked periods contribute to rolling averages and trend measurements; preliminary periods remain visible without changing the historical score.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              disabled={busy}
              className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={previewReport}
              disabled={!dashboard?.document}
              className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-40"
            >
              Full Report
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60"
            >
              Close
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {busy && !dashboard ? (
          <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">
            Loading forecast performance...
          </div>
        ) : null}

        {dashboard ? (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map(card => (
                <div key={card.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                    {card.label}
                  </div>
                  <div className="mt-3 text-2xl font-medium text-white">
                    {card.value}
                  </div>
                  <div className="mt-2 text-xs text-white/40">
                    {card.detail}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.20em] text-white/35">
                      Latest final-period change
                    </div>
                    <div className="mt-2 text-sm text-white/55">
                      {trend.available
                        ? `${trend.latest_final_period_name || "Latest final"} vs ${trend.previous_final_period_name || "previous final"}`
                        : "Two final measured periods are required for trend comparison"}
                    </div>
                  </div>
                  <div className="text-xs text-white/35">Negative points = improved accuracy</div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {trendCards.map(card => (
                    <div key={card.label} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                      <div className="text-xs text-white/45">{card.label}</div>
                      <div className="mt-2 text-xl text-white">{pointsLabel(card.value)}</div>
                      <div className="mt-1 text-xs text-white/35">{trendMeaning(card.value)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="text-[11px] uppercase tracking-[0.20em] text-white/35">
                  Coverage
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {coverageCards.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                      <div className="text-2xl text-white">{value}</div>
                      <div className="mt-1 text-xs text-white/40">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.20em] text-white/35">
                    Approved forecast period history
                  </div>
                  <div className="mt-2 text-sm text-white/50">
                    Latest approved Base scenario snapshots for this legal entity.
                  </div>
                </div>
                <div className="text-xs text-white/35">
                  History limit {dashboard.history_limit || 12}
                </div>
              </div>

              {!history.length ? (
                <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-5 text-sm text-white/45">
                  No approved forecast versions exist for this entity yet.
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-[0.14em] text-white/30">
                      <tr>
                        <th className="pb-3 pr-4 font-normal">Period</th>
                        <th className="pb-3 pr-4 font-normal">Status</th>
                        <th className="pb-3 pr-4 font-normal">Revenue error</th>
                        <th className="pb-3 pr-4 font-normal">Operating profit error</th>
                        <th className="pb-3 pr-4 font-normal">Version</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 8).map(row => (
                        <tr key={`${row.period_id}-${row.version_id}`} className="border-t border-white/[0.06] text-white/60">
                          <td className="py-3 pr-4 text-white/80">{row.period_name}</td>
                          <td className="py-3 pr-4">{statusLabel(row.accuracy_status)}</td>
                          <td className="py-3 pr-4">{percentLabel(row.comparisons?.revenue?.absolute_error_percent)}</td>
                          <td className="py-3 pr-4">{percentLabel(row.comparisons?.operating_profit?.absolute_error_percent)}</td>
                          <td className="py-3 pr-4">v{row.version_number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-3 text-xs text-white/40 md:grid-cols-3">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                Revenue bias: {percentLabel(summary.average_revenue_bias_percent)}
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                Operating profit bias: {percentLabel(summary.average_operating_profit_bias_percent)}
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                Source: Approved SCENARIOS_VS_BUDGET Base snapshots
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
