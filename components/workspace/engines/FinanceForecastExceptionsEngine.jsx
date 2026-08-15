"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function severityLabel(value) {
  if (value === "critical") return "Critical";
  if (value === "warning") return "Warning";
  return "Info";
}

function statusLabel(value) {
  if (value === "ACKNOWLEDGED") return "Acknowledged";
  if (value === "RESOLVED") return "Resolved";
  return "Open";
}

export default function FinanceForecastExceptionsEngine({
  action,
  organizationId,
  onClose,
}) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mutationKey, setMutationKey] = useState("");
  const [error, setError] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [assignees, setAssignees] = useState([]);
  const [forms, setForms] = useState({});

  const endpointFor = useCallback(() => {
    return new URL(
      action?.api || "/api/finance/forecast/accuracy/exceptions",
      window.location.origin
    );
  }, [action?.api]);

  const load = useCallback(async () => {
    if (!organizationId) {
      setReport(null);
      setError("Select an organization to view forecast management exceptions.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const endpoint = endpointFor();
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
  }, [action?.historyLimit, endpointFor, organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!report?.can_manage || !organizationId) {
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
    return () => {
      cancelled = true;
    };
  }, [organizationId, report?.can_manage]);

  const exceptions = Array.isArray(report?.exceptions) ? report.exceptions : [];
  const filtered = useMemo(
    () => exceptions.filter(item => {
      const severityMatch = severity === "all" || item.severity === severity;
      const statusMatch = status === "all" || item.management?.status === status;
      return severityMatch && statusMatch;
    }),
    [exceptions, severity, status]
  );
  const summary = report?.summary || {};

  function formFor(item) {
    return forms[item.id] || {
      assignedTo: item.management?.assigned_to || "",
      dueDate: item.management?.due_date || "",
      resolutionNote: "",
    };
  }

  function updateForm(itemId, patch) {
    setForms(current => ({
      ...current,
      [itemId]: { ...(current[itemId] || {}), ...patch },
    }));
  }

  async function mutate(item, actionName) {
    const form = formFor(item);
    try {
      setMutationKey(`${item.id}:${actionName}`);
      setError("");
      const response = await fetch(endpointFor().toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          occurrenceKey: item.occurrence_key,
          action: actionName,
          assignedTo: form.assignedTo || null,
          dueDate: form.dueDate || null,
          resolutionNote: form.resolutionNote || null,
          limit: action?.historyLimit || 12,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || "Forecast exception action failed");
      }
      await load();
    } catch (mutationError) {
      setError(mutationError.message || "Forecast exception action failed");
    } finally {
      setMutationKey("");
    }
  }

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
    ["Open", summary.open_exceptions || 0],
    ["Acknowledged", summary.acknowledged_exceptions || 0],
    ["Resolved", summary.resolved_exceptions || 0],
    ["Overdue", summary.overdue_exceptions || 0],
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-5 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[30px] border border-white/[0.08] bg-[#0b0b0b]/95 p-7 shadow-2xl shadow-black/80">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.30em] text-amber-300/65">Finance Forecasting</div>
            <h2 className="mt-3 text-3xl font-light tracking-[-0.04em] text-white">Forecast Exceptions</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Govern forecast control exceptions with acknowledgement, ownership, due dates and audited resolution evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={busy} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-50">Refresh</button>
            <button onClick={previewReport} disabled={!report?.document} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-40">Full Report</button>
            <button onClick={onClose} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-white/60">Close</button>
          </div>
        </div>

        {error ? <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : null}
        {busy && !report ? <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">Loading forecast controls...</div> : null}

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
                <button key={value} onClick={() => setSeverity(value)} className={`rounded-xl border px-4 py-2 text-sm ${severity === value ? "border-amber-300/35 bg-amber-300/10 text-amber-100" : "border-white/[0.08] bg-white/[0.025] text-white/45"}`}>
                  {value === "all" ? "All severity" : severityLabel(value)}
                </button>
              ))}
              {["all", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map(value => (
                <button key={value} onClick={() => setStatus(value)} className={`rounded-xl border px-4 py-2 text-sm ${status === value ? "border-white/20 bg-white/[0.08] text-white" : "border-white/[0.08] bg-white/[0.025] text-white/45"}`}>
                  {value === "all" ? "All states" : statusLabel(value)}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {!filtered.length ? <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm text-white/45">No forecast management exceptions in this view.</div> : null}

              {filtered.map(item => {
                const management = item.management || { status: "OPEN" };
                const form = formFor(item);
                const resolved = management.status === "RESOLVED";
                return (
                  <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">{severityLabel(item.severity)} · {String(item.type || "").replaceAll("_", " ")}</div>
                        <div className="mt-2 text-lg text-white">{item.entity_name}</div>
                        <div className="mt-1 text-sm text-white/70">{item.title}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-xs text-white/45">{statusLabel(management.status)}</span>
                        {management.overdue ? <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">Overdue</span> : null}
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-white/50">{item.detail}</p>
                    {Array.isArray(item.evidence) && item.evidence.length ? (
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {item.evidence.map((evidence, index) => <div key={`${item.id}-e-${index}`} className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/40">{evidence}</div>)}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/45">Owner: {management.assigned_to_name || "Unassigned"}</div>
                      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/45">Due: {management.due_date || "Not set"}</div>
                      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-white/45">Acknowledged: {management.acknowledged_by_name || "No"}</div>
                    </div>

                    {resolved ? (
                      <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4 text-sm text-emerald-100/70">
                        Resolved by {management.resolved_by_name || "Finance"}: {management.resolution_note || "Resolution recorded"}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-sm text-amber-100/70">{item.recommended_action}</div>
                    )}

                    {report.can_manage && !resolved ? (
                      <div className="mt-5 grid gap-3 border-t border-white/[0.06] pt-5 lg:grid-cols-3">
                        <div className="space-y-2">
                          <select value={form.assignedTo || ""} onChange={event => updateForm(item.id, { assignedTo: event.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white">
                            <option value="">Select owner</option>
                            {assignees.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <button disabled={!form.assignedTo || Boolean(mutationKey)} onClick={() => mutate(item, "ASSIGN")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/65 disabled:opacity-40">Assign</button>
                        </div>
                        <div className="space-y-2">
                          <input type="date" value={form.dueDate || ""} onChange={event => updateForm(item.id, { dueDate: event.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white" />
                          <button disabled={Boolean(mutationKey)} onClick={() => mutate(item, "SET_DUE_DATE")} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/65 disabled:opacity-40">Set due date</button>
                        </div>
                        <div className="space-y-2">
                          {management.status === "OPEN" ? <button disabled={Boolean(mutationKey)} onClick={() => mutate(item, "ACKNOWLEDGE")} className="w-full rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-sm text-amber-100/75 disabled:opacity-40">Acknowledge</button> : null}
                          <textarea value={form.resolutionNote || ""} onChange={event => updateForm(item.id, { resolutionNote: event.target.value })} placeholder="Resolution evidence" rows={2} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25" />
                          <button disabled={!String(form.resolutionNote || "").trim() || Boolean(mutationKey)} onClick={() => mutate(item, "RESOLVE")} className="w-full rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 text-sm text-emerald-100/75 disabled:opacity-40">Resolve</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
