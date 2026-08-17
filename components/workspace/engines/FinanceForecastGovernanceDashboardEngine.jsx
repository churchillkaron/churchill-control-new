"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function percent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "Unavailable";
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusTone(value) {
  return Number(value) > 0 ? "text-amber-200" : "text-white";
}

function reviewStatusLabel(value) {
  if (value === "ACKNOWLEDGED") return "Acknowledged";
  if (value === "RESOLVED") return "Resolved";
  return "Open";
}

export default function FinanceForecastGovernanceDashboardEngine({ action, organizationId, onClose }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mutationKey, setMutationKey] = useState("");
  const [exportingKey, setExportingKey] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState("exceptions");
  const [assignees, setAssignees] = useState([]);
  const [forms, setForms] = useState({});

  const load = useCallback(async () => {
    if (!organizationId) {
      setData(null);
      setError("Select an organization to view forecast governance.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const endpoint = new URL(action?.api || "/api/finance/forecast/governance/dashboard", window.location.origin);
      endpoint.searchParams.set("organizationId", organizationId);
      endpoint.searchParams.set("limit", String(action?.historyLimit || 12));
      const response = await fetch(endpoint.toString());
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Forecast governance dashboard failed");
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError.message || "Forecast governance dashboard failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, action?.historyLimit, organizationId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data?.can_manage || !organizationId) {
      setAssignees([]);
      return;
    }

    let cancelled = false;
    async function loadAssignees() {
      try {
        const endpoint = new URL("/api/platform/lookups", window.location.origin);
        endpoint.searchParams.set("organizationId", organizationId);
        endpoint.searchParams.set("lookup", "finance_assignees");
        const response = await fetch(endpoint.toString());
        const json = await response.json().catch(() => []);
        if (!response.ok) throw new Error(json?.error || "Finance assignee lookup failed");
        if (!cancelled) setAssignees(Array.isArray(json) ? json : []);
      } catch (lookupError) {
        if (!cancelled) setError(lookupError.message || "Finance assignee lookup failed");
      }
    }

    loadAssignees();
    return () => { cancelled = true; };
  }, [data?.can_manage, organizationId]);

  const summary = data?.summary || {};
  const portfolioRows = data?.portfolio?.entities || [];
  const exceptionRows = data?.exception_oversight?.queues?.unresolved_aging || [];
  const draftRows = data?.approval_readiness?.drafts || [];
  const overrideRows = data?.approval_readiness?.approved_overrides || [];
  const reviewRows = data?.approval_readiness?.override_reviews || [];
  const deliveryRows = data?.delivery_evidence || [];

  const rows = useMemo(() => {
    if (view === "approvals") return draftRows;
    if (view === "overrides") return overrideRows;
    if (view === "reviews") return reviewRows;
    if (view === "portfolio") return portfolioRows;
    if (view === "delivery") return deliveryRows;
    return exceptionRows;
  }, [view, draftRows, overrideRows, reviewRows, portfolioRows, deliveryRows, exceptionRows]);

  function formFor(row) {
    const review = row.approval_override_review || {};
    return forms[row.id] || {
      assignedTo: review.assigned_to || "",
      dueDate: review.due_date || "",
      resolutionNote: "",
    };
  }

  function updateForm(rowId, patch) {
    setForms(current => ({
      ...current,
      [rowId]: { ...(current[rowId] || {}), ...patch },
    }));
  }

  async function mutateReview(row, actionName) {
    const review = row.approval_override_review;
    if (!review?.occurrence_key) return;
    const form = formFor(row);

    try {
      setMutationKey(`${row.id}:${actionName}`);
      setError("");
      const response = await fetch("/api/finance/forecast/governance/override-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          occurrenceKey: review.occurrence_key,
          action: actionName,
          assignedTo: form.assignedTo || null,
          dueDate: form.dueDate || null,
          resolutionNote: form.resolutionNote || null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Forecast override review action failed");
      await load();
    } catch (mutationError) {
      setError(mutationError.message || "Forecast override review action failed");
    } finally {
      setMutationKey("");
    }
  }

  async function exportAuditPack(versionId = null) {
    if (!organizationId) return;
    const exportKey = versionId || "organization";

    try {
      setExportingKey(exportKey);
      setError("");
      const endpoint = new URL("/api/finance/forecast/governance/audit-pack", window.location.origin);
      endpoint.searchParams.set("organizationId", organizationId);
      if (versionId) endpoint.searchParams.set("versionId", versionId);

      const response = await fetch(endpoint.toString(), { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Forecast governance audit pack export failed");

      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = versionId
        ? `forecast-governance-audit-pack-${versionId}.json`
        : `forecast-governance-audit-pack-${organizationId}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (exportError) {
      setError(exportError.message || "Forecast governance audit pack export failed");
    } finally {
      setExportingKey("");
    }
  }

  function previewReport() {
    if (!data?.document) return;
    window.dispatchEvent(new CustomEvent("workspace:preview", {
      detail: {
        action: { ...action, title: "Forecast Governance Management Dashboard" },
        documentType: "FinancialReport",
        payload: { document: data.document },
        organizationId,
        entityId: null,
        periodId: null,
      },
    }));
  }

  const cards = [
    ["Approved Coverage", `${summary.entities_with_approved_forecasts || 0}/${summary.active_entities || 0}`],
    ["Approval-ready", summary.ready_drafts || 0],
    ["Policy-blocked", summary.blocked_drafts || 0],
    ["Overrides", summary.approval_overrides || 0],
    ["Open Reviews", (summary.override_review_open || 0) + (summary.override_review_acknowledged || 0)],
    ["Overdue Reviews", summary.override_review_overdue || 0],
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">Finance Forecasting</div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">Governance Management Dashboard</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-white/45">Executive control for approved forecast coverage, policy-blocked drafts, exceptional approvals, governed override review, exception accountability, escalation delivery, and canonical cross-entity accuracy.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={busy} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-50">Refresh</button>
            <button onClick={previewReport} disabled={!data?.document} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-40">Executive Report</button>
            <button onClick={() => exportAuditPack()} disabled={!organizationId || Boolean(exportingKey)} className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] px-4 py-2 text-sm text-fuchsia-100/80 disabled:opacity-40">{exportingKey === "organization" ? "Exporting…" : "Audit Pack"}</button>
            <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60">Close</button>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
        {busy && !data ? <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">Loading forecast governance...</div> : null}

        {data ? <>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-2xl text-white">{value}</div><div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/35">{label}</div></div>)}</div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Approval Governance</div><div className="mt-4 space-y-3 text-sm text-white/55"><div className="flex justify-between"><span>Draft versions</span><span className="text-white">{summary.draft_versions || 0}</span></div><div className="flex justify-between"><span>Approval-ready</span><span className="text-white">{summary.ready_drafts || 0}</span></div><div className="flex justify-between"><span>Policy-blocked</span><span className={statusTone(summary.blocked_drafts)}>{summary.blocked_drafts || 0}</span></div><div className="flex justify-between"><span>Approved with override</span><span className={summary.approval_overrides ? "text-fuchsia-200" : "text-white"}>{summary.approval_overrides || 0}</span></div></div></div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Override Review</div><div className="mt-4 space-y-3 text-sm text-white/55"><div className="flex justify-between"><span>Open</span><span className={statusTone(summary.override_review_open)}>{summary.override_review_open || 0}</span></div><div className="flex justify-between"><span>Acknowledged</span><span className={statusTone(summary.override_review_acknowledged)}>{summary.override_review_acknowledged || 0}</span></div><div className="flex justify-between"><span>Overdue</span><span className={statusTone(summary.override_review_overdue)}>{summary.override_review_overdue || 0}</span></div><div className="flex justify-between"><span>Resolved</span><span className="text-white">{summary.override_review_resolved || 0}</span></div></div></div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="text-xs uppercase tracking-[0.16em] text-white/35">Accuracy Governance</div><div className="mt-4 space-y-3 text-sm text-white/55"><div className="flex justify-between"><span>Final measured entities</span><span className="text-white">{summary.entities_with_final_measurement || 0}</span></div><div className="flex justify-between"><span>Measurement errors</span><span className={statusTone(summary.entities_with_measurement_errors)}>{summary.entities_with_measurement_errors || 0}</span></div><div className="flex justify-between"><span>Portfolio revenue error</span><span className="text-white">{percent(summary.portfolio_revenue_error_percent)}</span></div><div className="flex justify-between"><span>Operating profit error</span><span className="text-white">{percent(summary.portfolio_operating_profit_error_percent)}</span></div></div></div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">{[["exceptions","Exception Queue"],["approvals","Approval Readiness"],["overrides","Approval Overrides"],["reviews","Override Reviews"],["portfolio","Entity Coverage"],["delivery","Delivery Evidence"]].map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`rounded-xl border px-4 py-2 text-sm ${view === key ? "border-amber-300/35 bg-amber-300/10 text-amber-100" : "border-white/[0.08] bg-white/[0.025] text-white/45"}`}>{label}</button>)}</div>

          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            {!rows.length ? <div className="text-sm text-white/40">No records in this governance view.</div> : null}
            {view === "exceptions" ? <div className="space-y-3">{rows.map(row => <div key={row.occurrence_key} className="rounded-xl border border-white/[0.06] bg-black/20 p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="text-sm text-white/80">{row.entity_name} · {row.title}</div><div className="mt-1 text-xs text-white/40">{row.escalation_level} · {row.status} · {row.assigned_to_name || "Unassigned"}</div></div><div className="text-xs text-white/40">{row.due_date ? `Due ${row.due_date}` : "No due date"}</div></div></div>)}</div> : null}
            {view === "approvals" ? <div className="space-y-3">{rows.map(row => <div key={row.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="text-sm text-white/80">v{row.version_number} · {row.scenario_kind}</div><div className="mt-1 text-xs text-white/40">{row.approval_blockers?.length ? `Blocked: ${row.approval_blockers.join(" · ")}` : "Approval-ready"}</div></div><div className={row.approval_blockers?.length ? "text-xs text-amber-200" : "text-xs text-emerald-200"}>{row.approval_blockers?.length ? "POLICY BLOCKED" : "READY"}</div></div></div>)}</div> : null}
            {view === "overrides" ? <div className="space-y-3">{rows.map(row => <div key={row.id} className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.035] p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="text-sm text-fuchsia-100">v{row.version_number} · {row.scenario_kind}</div><div className="mt-1 text-xs text-white/50">Reason: {row.approval_override_reason || "Recorded in audit evidence"}</div><div className="mt-1 text-xs text-white/40">By {row.approval_override_by || "Recorded actor"} · {dateLabel(row.approval_override_at || row.approved_at)}</div>{row.approval_override_blockers?.length ? <div className="mt-1 text-xs text-amber-100/70">Overridden: {row.approval_override_blockers.join(" · ")}</div> : null}</div><div className="flex flex-col items-end gap-2"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-200">Override</div><button onClick={() => exportAuditPack(row.id)} disabled={Boolean(exportingKey)} className="rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/[0.05] px-3 py-1.5 text-xs text-fuchsia-100/70 disabled:opacity-40">{exportingKey === row.id ? "Exporting…" : "Export evidence"}</button></div></div></div>)}</div> : null}
            {view === "reviews" ? <div className="space-y-3">{rows.map(row => {
              const review = row.approval_override_review || {};
              const form = formFor(row);
              const resolved = review.status === "RESOLVED";
              const overdue = !resolved && review.due_date && String(review.due_date) < new Date().toISOString().slice(0, 10);
              return <div key={row.id} className="rounded-xl border border-fuchsia-300/15 bg-fuchsia-300/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm text-fuchsia-100">v{row.version_number} · {row.scenario_kind}</div><div className="mt-1 text-xs text-white/50">Override: {row.approval_override_reason || "Recorded in audit evidence"}</div><div className="mt-1 text-xs text-white/40">Owner: {review.assigned_to_name || "Unassigned"} · Due: {review.due_date || "Not set"}</div>{resolved ? <div className="mt-2 text-xs text-emerald-200">Resolved by {review.resolved_by_name || "Finance"}: {review.resolution_note || "Resolution recorded"}</div> : null}</div><div className="flex flex-wrap items-center justify-end gap-2"><span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-xs text-white/60">{reviewStatusLabel(review.status)}</span>{overdue ? <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">Overdue</span> : null}<button onClick={() => exportAuditPack(row.id)} disabled={Boolean(exportingKey)} className="rounded-full border border-fuchsia-300/15 bg-fuchsia-300/[0.05] px-3 py-1 text-xs text-fuchsia-100/70 disabled:opacity-40">{exportingKey === row.id ? "Exporting…" : "Export evidence"}</button></div></div>
                {data.can_manage && !resolved ? <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 lg:grid-cols-3"><div className="space-y-2"><select value={form.assignedTo || ""} onChange={event => updateForm(row.id, { assignedTo: event.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white"><option value="">Select owner</option>{assignees.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button disabled={!form.assignedTo || Boolean(mutationKey)} onClick={() => mutateReview(row, "ASSIGN")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/65 disabled:opacity-40">Assign</button></div><div className="space-y-2"><input type="date" value={form.dueDate || ""} onChange={event => updateForm(row.id, { dueDate: event.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white"/><button disabled={Boolean(mutationKey)} onClick={() => mutateReview(row, "SET_DUE_DATE")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/65 disabled:opacity-40">Set due date</button></div><div className="space-y-2">{review.status === "OPEN" ? <button disabled={Boolean(mutationKey)} onClick={() => mutateReview(row, "ACKNOWLEDGE")} className="w-full rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-sm text-amber-100/75 disabled:opacity-40">Acknowledge</button> : null}<textarea value={form.resolutionNote || ""} onChange={event => updateForm(row.id, { resolutionNote: event.target.value })} placeholder="Review resolution evidence" rows={2} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25"/><button disabled={!String(form.resolutionNote || "").trim() || Boolean(mutationKey)} onClick={() => mutateReview(row, "RESOLVE")} className="w-full rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 text-sm text-emerald-100/75 disabled:opacity-40">Resolve review</button></div></div> : null}
              </div>;
            })}</div> : null}
            {view === "portfolio" ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.14em] text-white/30"><tr><th className="pb-3">Entity</th><th className="pb-3">Approved periods</th><th className="pb-3">Final measured</th><th className="pb-3">Revenue error</th><th className="pb-3">Operating profit error</th></tr></thead><tbody>{rows.map(row => <tr key={row.entity_id} className="border-t border-white/[0.06] text-white/60"><td className="py-3 text-white/80">{row.entity_name}</td><td>{row.approved_periods || 0}</td><td>{row.final_measured_periods || 0}</td><td>{percent(row.rolling_revenue_absolute_error_percent)}</td><td>{percent(row.rolling_operating_profit_absolute_error_percent)}</td></tr>)}</tbody></table></div> : null}
            {view === "delivery" ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.14em] text-white/30"><tr><th className="pb-3">Case</th><th className="pb-3">Level</th><th className="pb-3">Recipient</th><th className="pb-3">Revision</th><th className="pb-3">Delivered</th></tr></thead><tbody>{rows.map((row,index) => <tr key={`${row.case_id}-${row.recipient_user_id}-${index}`} className="border-t border-white/[0.06] text-white/60"><td className="py-3">{row.case_id}</td><td>{row.escalation_level}</td><td>{row.recipient_kind}</td><td>{row.escalation_revision}</td><td>{dateLabel(row.delivered_at)}</td></tr>)}</tbody></table></div> : null}
          </div>
        </> : null}
      </div>
    </div>
  );
}