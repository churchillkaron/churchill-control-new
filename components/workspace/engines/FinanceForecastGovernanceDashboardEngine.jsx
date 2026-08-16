"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function percent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "Unavailable";
}

function statusTone(value) {
  if (Number(value) > 0) return "text-amber-200";
  return "text-white";
}

export default function FinanceForecastGovernanceDashboardEngine({
  action,
  organizationId,
  onClose,
}) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("exceptions");

  const load = useCallback(async () => {
    if (!organizationId) {
      setData(null);
      setError("Select an organization to view forecast governance.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const endpoint = new URL(
        action?.api || "/api/finance/forecast/governance/dashboard",
        window.location.origin
      );
      endpoint.searchParams.set("organizationId", organizationId);
      endpoint.searchParams.set("limit", String(action?.historyLimit || 12));
      const response = await fetch(endpoint.toString(), { method: "GET" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast governance dashboard failed");
      }
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError.message || "Forecast governance dashboard failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, action?.historyLimit, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const portfolioRows = data?.portfolio?.entities || [];
  const exceptionRows = data?.exception_oversight?.queues?.unresolved_aging || [];
  const draftRows = data?.approval_readiness?.drafts || [];
  const deliveryRows = data?.delivery_evidence || [];

  const rows = useMemo(() => {
    if (view === "approvals") return draftRows;
    if (view === "portfolio") return portfolioRows;
    if (view === "delivery") return deliveryRows;
    return exceptionRows;
  }, [view, draftRows, portfolioRows, deliveryRows, exceptionRows]);

  function previewReport() {
    if (!data?.document) return;
    window.dispatchEvent(
      new CustomEvent("workspace:preview", {
        detail: {
          action: { ...action, title: "Forecast Governance Management Dashboard" },
          documentType: "FinancialReport",
          payload: { document: data.document },
          organizationId,
          entityId: null,
          periodId: null,
        },
      })
    );
  }

  const cards = [
    ["Approved Coverage", `${summary.entities_with_approved_forecasts || 0}/${summary.active_entities || 0}`],
    ["Ready Drafts", summary.ready_drafts || 0],
    ["Not-ready Drafts", summary.not_ready_drafts || 0],
    ["Unresolved", summary.unresolved_exceptions || 0],
    ["Critical Escalations", summary.critical_escalations || 0],
    ["Delivered Alerts", summary.delivered_notifications || 0],
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">Finance Forecasting</div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">Governance Management Dashboard</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-white/45">
              One control surface for approved forecast coverage, draft readiness, exception accountability, escalation delivery evidence, and canonical cross-entity forecast accuracy. No composite score or invented threshold is applied.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={busy} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-50">Refresh</button>
            <button onClick={previewReport} disabled={!data?.document} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-40">Executive Report</button>
            <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60">Close</button>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
        {busy && !data ? <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">Loading forecast governance...</div> : null}

        {data ? (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {cards.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="text-2xl text-white">{value}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Approval Readiness</div>
                <div className="mt-4 space-y-3 text-sm text-white/55">
                  <div className="flex justify-between"><span>Draft versions</span><span className="text-white">{summary.draft_versions || 0}</span></div>
                  <div className="flex justify-between"><span>Ready drafts</span><span className="text-white">{summary.ready_drafts || 0}</span></div>
                  <div className="flex justify-between"><span>Not-ready drafts</span><span className={statusTone(summary.not_ready_drafts)}>{summary.not_ready_drafts || 0}</span></div>
                  <div className="flex justify-between"><span>Budget-incomplete drafts</span><span className={statusTone(summary.budget_incomplete_drafts)}>{summary.budget_incomplete_drafts || 0}</span></div>
                  <div className="flex justify-between"><span>Approved but not ready</span><span className={statusTone(summary.approved_not_ready)}>{summary.approved_not_ready || 0}</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Exception Accountability</div>
                <div className="mt-4 space-y-3 text-sm text-white/55">
                  <div className="flex justify-between"><span>Overdue unresolved</span><span className={statusTone(summary.overdue_unresolved)}>{summary.overdue_unresolved || 0}</span></div>
                  <div className="flex justify-between"><span>Unassigned unresolved</span><span className={statusTone(summary.unassigned_unresolved)}>{summary.unassigned_unresolved || 0}</span></div>
                  <div className="flex justify-between"><span>Not yet governed</span><span className={statusTone(summary.not_yet_governed)}>{summary.not_yet_governed || 0}</span></div>
                  <div className="flex justify-between"><span>Assignee deliveries</span><span className="text-white">{summary.assignee_deliveries || 0}</span></div>
                  <div className="flex justify-between"><span>Manager deliveries</span><span className="text-white">{summary.manager_deliveries || 0}</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/35">Accuracy Governance</div>
                <div className="mt-4 space-y-3 text-sm text-white/55">
                  <div className="flex justify-between"><span>Final measured entities</span><span className="text-white">{summary.entities_with_final_measurement || 0}</span></div>
                  <div className="flex justify-between"><span>Measurement errors</span><span className={statusTone(summary.entities_with_measurement_errors)}>{summary.entities_with_measurement_errors || 0}</span></div>
                  <div className="flex justify-between"><span>Portfolio revenue error</span><span className="text-white">{percent(summary.portfolio_revenue_error_percent)}</span></div>
                  <div className="flex justify-between"><span>Portfolio operating profit error</span><span className="text-white">{percent(summary.portfolio_operating_profit_error_percent)}</span></div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ["exceptions", "Exception Queue"],
                ["approvals", "Approval Readiness"],
                ["portfolio", "Entity Coverage"],
                ["delivery", "Delivery Evidence"],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setView(key)} className={`rounded-xl border px-4 py-2 text-sm ${view === key ? "border-amber-300/35 bg-amber-300/10 text-amber-100" : "border-white/[0.08] bg-white/[0.025] text-white/45"}`}>{label}</button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              {!rows.length ? <div className="text-sm text-white/40">No records in this governance view.</div> : null}

              {view === "exceptions" ? (
                <div className="space-y-3">
                  {rows.map(row => (
                    <div key={row.occurrence_key} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div><div className="text-sm text-white/80">{row.entity_name} · {row.title}</div><div className="mt-1 text-xs text-white/40">{row.escalation_level} · {row.status} · {row.assigned_to_name || "Unassigned"}</div></div>
                        <div className="text-xs text-white/40">{row.due_date ? `Due ${row.due_date}` : "No due date"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {view === "approvals" ? (
                <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.14em] text-white/30"><tr><th className="pb-3">Version</th><th className="pb-3">Kind</th><th className="pb-3">Status</th><th className="pb-3">Forecast ready</th><th className="pb-3">Budget complete</th><th className="pb-3">Created</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-white/[0.06] text-white/60"><td className="py-3">v{row.version_number}</td><td>{row.scenario_kind}</td><td>{row.status}</td><td>{row.forecast_ready ? "Yes" : "No"}</td><td>{row.budget_complete === null ? "N/A" : row.budget_complete ? "Yes" : "No"}</td><td>{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>
              ) : null}

              {view === "portfolio" ? (
                <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.14em] text-white/30"><tr><th className="pb-3">Entity</th><th className="pb-3">Approved periods</th><th className="pb-3">Final measured</th><th className="pb-3">Revenue error</th><th className="pb-3">Operating profit error</th></tr></thead><tbody>{rows.map(row => <tr key={row.entity_id} className="border-t border-white/[0.06] text-white/60"><td className="py-3 text-white/80">{row.entity_name}</td><td>{row.approved_periods || 0}</td><td>{row.final_measured_periods || 0}</td><td>{percent(row.rolling_revenue_absolute_error_percent)}</td><td>{percent(row.rolling_operating_profit_absolute_error_percent)}</td></tr>)}</tbody></table></div>
              ) : null}

              {view === "delivery" ? (
                <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.14em] text-white/30"><tr><th className="pb-3">Case</th><th className="pb-3">Level</th><th className="pb-3">Recipient type</th><th className="pb-3">Revision</th><th className="pb-3">Delivered</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.case_id}-${row.recipient_user_id}-${row.escalation_revision}-${index}`} className="border-t border-white/[0.06] text-white/60"><td className="py-3">{row.case_id}</td><td>{row.escalation_level}</td><td>{row.recipient_kind}</td><td>{row.escalation_revision}</td><td>{row.delivered_at ? new Date(row.delivered_at).toLocaleString() : "Pending"}</td></tr>)}</tbody></table></div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
