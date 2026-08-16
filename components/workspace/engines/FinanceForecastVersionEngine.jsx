"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = ["ALL", "DRAFT", "APPROVED", "SUPERSEDED"];
const KIND_OPTIONS = ["ALL", "SCENARIOS_VS_BUDGET", "SCENARIOS"];

function kindLabel(kind) {
  return kind === "SCENARIOS_VS_BUDGET" ? "Scenarios vs Budget" : "Forecast Scenarios";
}

function dateLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function normalizedStatus(version) {
  return String(version?.status || "").trim().toUpperCase();
}

function approvalBlockers(version) {
  const blockers = [];
  if (version?.forecast_ready !== true) blockers.push("Forecast is not ready");
  if (version?.scenario_kind === "SCENARIOS_VS_BUDGET") {
    if (version?.budget_available !== true) blockers.push("Budget is unavailable");
    else if (version?.budget_complete !== true) blockers.push("Budget is incomplete");
  }
  return blockers;
}

function statusClasses(status) {
  if (status === "APPROVED") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (status === "DRAFT") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-white/[0.08] bg-white/[0.04] text-white/45";
}

export default function FinanceForecastVersionEngine({ action, organizationId, entityId, periodId, onClose }) {
  const [versions, setVersions] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [canOverride, setCanOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [overrideVersion, setOverrideVersion] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !entityId || !periodId) {
      setVersions([]);
      setCanManage(false);
      setCanOverride(false);
      setError("Select an organization, legal entity, and accounting period to view forecast versions.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const params = new URLSearchParams({ organizationId, entityId, periodId });
      const response = await fetch(`${action?.api || "/api/finance/forecast/versions"}?${params.toString()}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Forecast version loading failed");
      setVersions(Array.isArray(json.versions) ? json.versions : []);
      setCanManage(json.can_manage === true);
      setCanOverride(json.can_override_approval === true);
    } catch (loadError) {
      setError(loadError.message || "Forecast version loading failed");
    } finally {
      setBusy(false);
    }
  }, [action?.api, organizationId, entityId, periodId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setStatusFilter("ALL");
    setKindFilter("ALL");
    setOverrideVersion(null);
    setOverrideReason("");
  }, [organizationId, entityId, periodId]);

  const filteredVersions = useMemo(() => versions.filter(version => {
    const status = normalizedStatus(version);
    return (statusFilter === "ALL" || status === statusFilter) &&
      (kindFilter === "ALL" || version?.scenario_kind === kindFilter);
  }), [versions, statusFilter, kindFilter]);

  const counts = useMemo(() => ({
    ready: versions.filter(v => normalizedStatus(v) === "DRAFT" && approvalBlockers(v).length === 0).length,
    blocked: versions.filter(v => normalizedStatus(v) === "DRAFT" && approvalBlockers(v).length > 0).length,
    overridden: versions.filter(v => normalizedStatus(v) === "APPROVED" && v.approval_override === true).length,
  }), [versions]);

  function preview(version) {
    const document = version?.result_snapshot?.document;
    if (!document) return setError("This forecast version does not contain a previewable report document.");
    window.dispatchEvent(new CustomEvent("workspace:preview", {
      detail: {
        action: { ...action, title: `${kindLabel(version.scenario_kind)} - Version ${version.version_number}` },
        documentType: "FinancialReport",
        payload: { document },
        organizationId,
        entityId,
        periodId,
      },
    }));
  }

  async function submitApproval(version, override = false) {
    try {
      setBusy(true);
      setError("");
      const response = await fetch(action?.api || "/api/finance/forecast/versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          versionId: version.id,
          action: override ? "override_approve" : "approve",
          ...(override ? { overrideReason: overrideReason.trim() } : {}),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Forecast version approval failed");
      setOverrideVersion(null);
      setOverrideReason("");
      await load();
    } catch (approvalError) {
      setError(approvalError.message || "Forecast version approval failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">Finance Forecasting</div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">Forecast Versions</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">Normal approval is available only when the stored forecast is ready and, for Scenarios vs Budget, the budget is both available and complete. Exceptional approval is separately permission-gated, reason-required, and audit-visible.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60">Close</button>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="text-2xl text-white">{counts.ready}</div><div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/35">Approval-ready drafts</div></div>
          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4"><div className="text-2xl text-amber-100">{counts.blocked}</div><div className="mt-1 text-xs uppercase tracking-[0.14em] text-amber-100/55">Policy-blocked drafts</div></div>
          <div className="rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.04] p-4"><div className="text-2xl text-fuchsia-100">{counts.overridden}</div><div className="mt-1 text-xs uppercase tracking-[0.14em] text-fuchsia-100/55">Approved with override</div></div>
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-2">{STATUS_OPTIONS.map(status => <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-xl border px-3 py-2 text-xs ${statusFilter === status ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-white/[0.08] text-white/45"}`}>{status}</button>)}</div>
          <div className="flex flex-wrap gap-2">{KIND_OPTIONS.map(kind => <button key={kind} onClick={() => setKindFilter(kind)} className={`rounded-xl border px-3 py-2 text-xs ${kindFilter === kind ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-white/[0.08] text-white/45"}`}>{kind === "ALL" ? "ALL TYPES" : kindLabel(kind)}</button>)}</div>
        </div>

        <div className="mt-6 space-y-3">
          {busy && !versions.length ? <div className="rounded-2xl border border-white/[0.08] p-5 text-sm text-white/45">Loading forecast versions...</div> : null}
          {!busy && !filteredVersions.length ? <div className="rounded-2xl border border-white/[0.08] p-5 text-sm text-white/45">No forecast versions match this view.</div> : null}

          {filteredVersions.map(version => {
            const status = normalizedStatus(version);
            const blockers = approvalBlockers(version);
            const overridden = version.approval_override === true;
            const overrideEvidence = version.governance?.approval_override;
            return (
              <div key={version.id} className={`rounded-2xl border p-5 ${status === "APPROVED" ? "border-emerald-300/20 bg-emerald-300/[0.035]" : "border-white/[0.08] bg-white/[0.025]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-medium text-white">Version {version.version_number} · {kindLabel(version.scenario_kind)}</div>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusClasses(status)}`}>{status}</span>
                      {overridden ? <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-200">Override</span> : null}
                    </div>
                    <div className="mt-2 text-xs text-white/40">Created {dateLabel(version.created_at)} · Forecast ready {version.forecast_ready ? "Yes" : "No"} · Budget {version.budget_available === null ? "N/A" : version.budget_complete ? "Complete" : version.budget_available ? "Incomplete" : "Unavailable"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => preview(version)} disabled={busy} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/70 disabled:opacity-50">Preview</button>
                    {canManage && status === "DRAFT" && blockers.length === 0 ? <button onClick={() => submitApproval(version)} disabled={busy} className="rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">Approve</button> : null}
                    {canManage && canOverride && status === "DRAFT" && blockers.length > 0 ? <button onClick={() => { setOverrideVersion(version); setOverrideReason(""); }} disabled={busy} className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-2 text-sm font-semibold text-fuchsia-100 disabled:opacity-50">Exceptional Override</button> : null}
                  </div>
                </div>

                {status === "DRAFT" && blockers.length > 0 ? <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-xs text-amber-100/75"><div className="font-semibold uppercase tracking-[0.12em]">Normal approval blocked</div><div className="mt-2">{blockers.join(" · ")}</div>{canOverride ? <div className="mt-2 text-white/45">Exceptional approval requires a recorded business reason and creates immutable override audit evidence.</div> : null}</div> : null}

                {overridden ? <div className="mt-4 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/[0.05] px-4 py-3 text-xs text-fuchsia-100/75"><div className="font-semibold uppercase tracking-[0.12em]">Approved by exceptional override</div><div className="mt-2">Reason: {version.approval_override_reason || overrideEvidence?.reason || "Recorded in governance evidence"}</div><div className="mt-1">By {overrideEvidence?.name || "Recorded actor"} · {dateLabel(overrideEvidence?.at || version.approved_at)}</div>{overrideEvidence?.blockers?.length ? <div className="mt-1">Overridden blockers: {overrideEvidence.blockers.join(" · ")}</div> : null}</div> : null}
              </div>
            );
          })}
        </div>

        {overrideVersion ? <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 px-5 backdrop-blur-md"><div className="w-full max-w-xl rounded-[26px] border border-fuchsia-300/20 bg-[#0b0b0b] p-6 shadow-2xl"><div className="text-xs uppercase tracking-[0.18em] text-fuchsia-200/70">Exceptional Forecast Approval</div><h3 className="mt-2 text-xl text-white">Override Version {overrideVersion.version_number}</h3><div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-sm text-amber-100/70">Policy blockers: {approvalBlockers(overrideVersion).join(" · ")}</div><label className="mt-5 block text-xs uppercase tracking-[0.14em] text-white/35">Required business reason</label><textarea value={overrideReason} onChange={event => setOverrideReason(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/30 p-3 text-sm text-white outline-none" placeholder="Explain why exceptional approval is required despite the current policy blockers." /><div className="mt-5 flex justify-end gap-2"><button onClick={() => { setOverrideVersion(null); setOverrideReason(""); }} disabled={busy} className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-white/60">Cancel</button><button onClick={() => submitApproval(overrideVersion, true)} disabled={busy || !overrideReason.trim()} className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/15 px-4 py-2 text-sm font-semibold text-fuchsia-100 disabled:opacity-40">Approve with Override</button></div></div></div> : null}
      </div>
    </div>
  );
}
