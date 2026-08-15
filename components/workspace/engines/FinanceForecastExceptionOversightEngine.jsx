"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function valueOrDash(value) {
  return value === null || value === undefined ? "—" : value;
}

function ageLabel(item) {
  if (!item?.persisted) return "Not yet governed";
  if (!Number.isFinite(item?.age_days)) return "Governed";
  return `${item.age_days} day${item.age_days === 1 ? "" : "s"}`;
}

export default function FinanceForecastExceptionOversightEngine({
  action,
  organizationId,
  onClose,
}) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("overdue");

  const load = useCallback(async () => {
    if (!organizationId) {
      setReport(null);
      setError("Select an organization to view forecast exception oversight.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const endpoint = new URL(
        action?.api || "/api/finance/forecast/accuracy/exceptions/oversight",
        window.location.origin
      );
      endpoint.searchParams.set("organizationId", organizationId);
      endpoint.searchParams.set("limit", String(action?.historyLimit || 12));

      const response = await fetch(endpoint.toString(), { method: "GET" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast exception oversight failed");
      }
      setReport(json);
    } catch (loadError) {
      setReport(null);
      setError(loadError.message || "Forecast exception oversight failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, action?.historyLimit, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = report?.summary || {};
  const queues = report?.queues || {};
  const rows = useMemo(() => {
    if (view === "unassigned") return queues.unassigned || [];
    if (view === "open") return queues.open_unacknowledged || [];
    if (view === "aging") return queues.unresolved_aging || [];
    if (view === "without_due") return queues.without_due_date || [];
    return queues.overdue || [];
  }, [queues, view]);

  function previewReport() {
    if (!report?.document) return;
    window.dispatchEvent(
      new CustomEvent("workspace:preview", {
        detail: {
          action: { ...action, title: "Forecast Exception Oversight" },
          documentType: "FinancialReport",
          payload: { document: report.document },
          organizationId,
          entityId: null,
          periodId: null,
        },
      })
    );
  }

  const cards = [
    ["Unresolved", summary.unresolved_exceptions || 0],
    ["Critical", summary.critical_unresolved || 0],
    ["Overdue", summary.overdue_unresolved || 0],
    ["Unassigned", summary.unassigned_unresolved || 0],
    ["Not Governed", summary.not_yet_governed || 0],
    ["Owners", summary.owners_with_unresolved_work || 0],
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">
              Finance Forecasting
            </div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">
              Exception Oversight
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Executive control over unresolved forecast exceptions, ownership, due dates, governed aging, and resolution performance.
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
              Executive Report
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
            Loading forecast oversight...
          </div>
        ) : null}

        {report ? (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {cards.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="text-2xl text-white">{value}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_2fr]">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Control Health</div>
                <div className="mt-4 space-y-3 text-sm text-white/55">
                  <div className="flex justify-between gap-4"><span>Open unacknowledged</span><span className="text-white">{summary.open_unacknowledged || 0}</span></div>
                  <div className="flex justify-between gap-4"><span>Acknowledged unresolved</span><span className="text-white">{summary.acknowledged_unresolved || 0}</span></div>
                  <div className="flex justify-between gap-4"><span>Without due date</span><span className="text-white">{summary.without_due_date_unresolved || 0}</span></div>
                  <div className="flex justify-between gap-4"><span>Average governed age</span><span className="text-white">{summary.average_governed_age_days === null ? "—" : `${summary.average_governed_age_days} days`}</span></div>
                  <div className="flex justify-between gap-4"><span>Oldest governed age</span><span className="text-white">{summary.oldest_governed_age_days === null ? "—" : `${summary.oldest_governed_age_days} days`}</span></div>
                  <div className="flex justify-between gap-4"><span>Average resolution time</span><span className="text-white">{summary.average_resolution_days === null ? "—" : `${summary.average_resolution_days} days`}</span></div>
                  <div className="flex justify-between gap-4"><span>Resolved history</span><span className="text-white">{summary.resolved_case_history || 0}</span></div>
                  <div className="flex justify-between gap-4"><span>Resolved but source still active</span><span className="text-white">{summary.resolved_active_conditions || 0}</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Owner Workload</div>
                <div className="mt-4 space-y-2">
                  {!report.owner_workload?.length ? (
                    <div className="text-sm text-white/40">No assigned unresolved forecast exceptions.</div>
                  ) : null}
                  {(report.owner_workload || []).map(owner => (
                    <div key={owner.assigned_to} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-white/75">{owner.assigned_to_name}</div>
                        <div className="text-xs text-white/35">{owner.unresolved} unresolved</div>
                      </div>
                      <div className="mt-2 text-xs text-white/40">
                        {owner.overdue} overdue · {owner.critical} critical · {owner.without_due_date} without due date · oldest {valueOrDash(owner.oldest_age_days)} day(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ["overdue", "Overdue"],
                ["unassigned", "Unassigned"],
                ["open", "Unacknowledged"],
                ["without_due", "No Due Date"],
                ["aging", "Aging"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    view === key
                      ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                      : "border-white/[0.08] bg-white/[0.025] text-white/45"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {!rows.length ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">
                  No forecast exceptions in this oversight queue.
                </div>
              ) : null}

              {rows.map(item => (
                <div key={item.occurrence_key} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                        {item.severity} · {item.status} · {String(item.exception_type || "").replaceAll("_", " ")}
                      </div>
                      <div className="mt-2 text-lg text-white">{item.entity_name}</div>
                      <div className="mt-1 text-sm text-white/70">{item.title}</div>
                    </div>
                    <div className="text-right text-xs text-white/40">
                      <div>{ageLabel(item)}</div>
                      <div className={item.overdue ? "mt-1 text-red-300" : "mt-1"}>
                        {item.overdue
                          ? `${item.days_overdue} day(s) overdue`
                          : item.due_date
                            ? `Due ${item.due_date}`
                            : "No due date"}
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-white/50">{item.detail}</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/40">
                      Owner: <span className="text-white/65">{item.assigned_to_name || "Unassigned"}</span>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/40">
                      Governance: <span className="text-white/65">{item.persisted ? "Persisted" : "Not yet governed"}</span>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/40">
                      Due: <span className="text-white/65">{item.due_date || "Not set"}</span>
                    </div>
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
