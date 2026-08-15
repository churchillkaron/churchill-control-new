"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function severityLabel(value) {
  if (value === "critical") return "Critical";
  if (value === "warning") return "Warning";
  return "Info";
}

export default function FinanceForecastExceptionsEngine({
  action,
  organizationId,
  onClose,
}) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState("all");

  const load = useCallback(async () => {
    if (!organizationId) {
      setReport(null);
      setError("Select an organization to view forecast management exceptions.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const endpoint = new URL(
        action?.api || "/api/finance/forecast/accuracy/exceptions",
        window.location.origin
      );
      endpoint.searchParams.set("organizationId", organizationId);
      endpoint.searchParams.set("limit", String(action?.historyLimit || 12));

      const response = await fetch(endpoint.toString(), { method: "GET" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast management exceptions failed");
      }
      setReport(json);
    } catch (loadError) {
      setReport(null);
      setError(loadError.message || "Forecast management exceptions failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, action?.historyLimit, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const exceptions = Array.isArray(report?.exceptions) ? report.exceptions : [];
  const filtered = useMemo(
    () =>
      severity === "all"
        ? exceptions
        : exceptions.filter(item => item.severity === severity),
    [exceptions, severity]
  );
  const summary = report?.summary || {};

  function previewReport() {
    if (!report?.document) return;
    window.dispatchEvent(
      new CustomEvent("workspace:preview", {
        detail: {
          action: { ...action, title: "Forecast Management Exceptions" },
          documentType: "FinancialReport",
          payload: { document: report.document },
          organizationId,
          entityId: null,
          periodId: null,
        },
      })
    );
  }

  const counts = [
    ["Critical", summary.critical_exceptions || 0],
    ["Warning", summary.warning_exceptions || 0],
    ["Info", summary.informational_exceptions || 0],
    ["Clear entities", summary.entities_without_exceptions || 0],
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
              Forecast Exceptions
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Control view for missing approvals, stale coverage, insufficient final history, deteriorating accuracy, and measurement failures across active legal entities.
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
              disabled={!report?.document}
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

        {busy && !report ? (
          <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">
            Loading forecast controls...
          </div>
        ) : null}

        {report ? (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {counts.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="text-2xl text-white">{value}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {["all", "critical", "warning", "info"].map(value => (
                <button
                  key={value}
                  onClick={() => setSeverity(value)}
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    severity === value
                      ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                      : "border-white/[0.08] bg-white/[0.025] text-white/45"
                  }`}
                >
                  {value === "all" ? "All" : severityLabel(value)}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {!filtered.length ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">
                  No forecast management exceptions in this view.
                </div>
              ) : null}

              {filtered.map(item => (
                <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                        {severityLabel(item.severity)} · {String(item.type || "").replaceAll("_", " ")}
                      </div>
                      <div className="mt-2 text-lg text-white">{item.entity_name}</div>
                      <div className="mt-1 text-sm text-white/70">{item.title}</div>
                    </div>
                    <div className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-xs text-white/45">
                      {severityLabel(item.severity)}
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-white/50">{item.detail}</p>

                  {Array.isArray(item.evidence) && item.evidence.length ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {item.evidence.map((evidence, index) => (
                        <div key={`${item.id}-e-${index}`} className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/40">
                          {evidence}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm text-amber-100/70">
                    {item.recommended_action}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
