"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Database, Loader2, ServerCog, ShieldAlert, WalletCards, X } from "lucide-react";

function t(value) { return String(value ?? "").trim(); }
function label(value) { return t(value || "unknown").replaceAll("_", " "); }
function numeric(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function durationHours(value) {
  const hours = numeric(value);
  if (hours < 24) return `${Math.max(0, Math.round(hours))}h`;
  const days = Math.floor(hours / 24);
  const remaining = Math.round(hours % 24);
  return remaining ? `${days}d ${remaining}h` : `${days}d`;
}
function severityTone(severity) {
  if (severity === "critical") return "border-red-700/15 bg-red-50 text-red-800";
  if (severity === "high") return "border-orange-700/15 bg-orange-50 text-orange-800";
  if (severity === "medium") return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}
function workflowTone(status) {
  if (status === "RESOLVED") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (status === "ACKNOWLEDGED") return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-red-700/15 bg-red-50 text-red-800";
}
function dueTone(status) {
  if (status === "breached") return "border-red-700/15 bg-red-50 text-red-800";
  if (status === "due_today") return "border-orange-700/15 bg-orange-50 text-orange-800";
  if (status === "within_sla") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}
function stateTone(state) {
  if (state === "critical") return "text-red-800";
  if (state === "attention") return "text-orange-800";
  if (state === "review") return "text-amber-800";
  return "text-emerald-800";
}
function IconFor({ category }) {
  if (category === "wallet") return <WalletCards size={13} />;
  if (category === "runtime" || category === "event_processing" || category === "release_governance") return <ServerCog size={13} />;
  if (category === "security_incident") return <ShieldAlert size={13} />;
  if (category === "service_execution") return <AlertTriangle size={13} />;
  return <CircleDot size={13} />;
}
function EvidenceCell({ name, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-2.5 py-2">
      <div className="text-[6.5px] font-semibold uppercase tracking-[0.1em] text-[#A29A91]">{name}</div>
      <div className="mt-0.5 break-words text-[8px] font-medium text-[#514B45]">{String(value)}</div>
    </div>
  );
}
function canInvestigate(signal) {
  return signal?.actionable === true || signal?.id === "system-event-backlog";
}

function InvestigationDrawer({ state, note, setNote, onClose, onAction }) {
  if (!state.open) return null;
  const payload = state.data;
  const signal = payload?.signal;
  const detail = signal?.detail || {};
  const summary = detail?.summary || {};
  const trend = Array.isArray(detail?.trend) ? detail.trend : [];
  const recent = Array.isArray(detail?.recent) ? detail.recent : [];
  const affected = Array.isArray(detail?.affected) ? detail.affected : [];
  const remediation = Array.isArray(detail?.remediation) ? detail.remediation : [];
  const currentCase = payload?.case || { status: "OPEN" };
  const history = Array.isArray(payload?.history) ? payload.history : [];
  const isEventBacklog = signal?.category === "event_processing";
  const isSystemAlert = signal?.category === "system_alert";
  const isSecurityIncident = signal?.category === "security_incident";
  const isSourceGoverned = isSystemAlert || isSecurityIncident;
  const maxTrend = Math.max(1, ...trend.map(row => numeric(row.failures)));
  const action = currentCase.status === "ACKNOWLEDGED" ? "RESOLVE" : currentCase.status === "RESOLVED" ? "REOPEN" : "ACKNOWLEDGE";
  const requiresNote = action === "RESOLVE" || action === "REOPEN";

  return (
    <div className="fixed inset-0 z-[90] bg-black/20" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="ml-auto flex h-full w-full max-w-[720px] flex-col border-l border-black/[0.08] bg-[#F7F6F3] shadow-[-24px_0_80px_rgba(0,0,0,0.14)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.07] bg-[#FFFDF9] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Operator investigation</div>
            <div className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#2D2925]">{signal?.title || "Loading evidence…"}</div>
            {signal ? <div className="mt-1 text-[8px] text-[#8E877F]">Authoritative source · {label(signal.source)}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-black/[0.07] bg-white p-2 text-[#766F67] hover:bg-[#F3F0EB]"><X size={14} /></button>
        </div>

        {state.loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[10px] text-[#827B73]"><Loader2 size={15} className="animate-spin" /> Loading exact evidence…</div>
        ) : state.error ? (
          <div className="p-5"><div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[9px] text-red-800">{state.error}</div></div>
        ) : signal ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${severityTone(signal.severity)}`}>{label(signal.severity)}</span>
              <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${workflowTone(currentCase.status)}`}>{currentCase.reopenedByEvidence ? "reopened by evidence" : label(currentCase.status)}</span>
              {isSourceGoverned ? <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${summary.remediation_verified ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-red-700/15 bg-red-50 text-red-800"}`}>{summary.remediation_verified ? "remediation verified" : "remediation not verified"}</span> : null}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <EvidenceCell name={isEventBacklog ? "Queued events" : isSourceGoverned ? "Open source rows" : "Occurrences / 24h"} value={numeric(summary.occurrence_count).toLocaleString("en-US")} />
              <EvidenceCell name="First seen" value={when(summary.first_seen_at)} />
              <EvidenceCell name="Last seen" value={when(summary.last_seen_at)} />
              {isEventBacklog ? <EvidenceCell name="Diagnosis" value={label(summary.diagnosis)} /> : isSourceGoverned ? <EvidenceCell name="Persisted severity" value={label(summary.persisted_severity)} /> : <EvidenceCell name="Avg provider latency" value={summary.average_provider_latency_ms ? `${summary.average_provider_latency_ms} ms` : "—"} />}
              <EvidenceCell name="Organization" value={signal.organization?.name || signal.organization?.legal_name || signal.organizationId || "Platform"} />
              {isEventBacklog ? <EvidenceCell name="Never attempted" value={numeric(summary.never_attempted_count)} /> : isSystemAlert ? <EvidenceCell name="Alert type" value={label(summary.alert_type)} /> : isSecurityIncident ? <EvidenceCell name="Workflow" value={summary.workflow} /> : <EvidenceCell name="Provider" value={summary.provider} />}
              {isEventBacklog ? <EvidenceCell name="Attempted" value={numeric(summary.attempted_count)} /> : isSourceGoverned ? <EvidenceCell name="Verified by" value={label(summary.remediation_reason)} /> : <EvidenceCell name="Capability" value={summary.capability} />}
              {isEventBacklog ? <EvidenceCell name="Oldest event" value={label(summary.oldest_event_type)} /> : isSecurityIncident ? <EvidenceCell name="Latest success" value={when(summary.latest_success_at)} /> : isSystemAlert ? <EvidenceCell name="Affected records" value={affected.length || numeric(summary.occurrence_count)} /> : <EvidenceCell name="Charged amount" value={numeric(summary.charged_amount_total || 0).toLocaleString("en-US", { maximumFractionDigits: 4 })} />}
            </div>

            <div className={`mt-4 rounded-xl border px-4 py-3 ${isSourceGoverned && summary.remediation_verified ? "border-emerald-700/12 bg-emerald-50/70" : isEventBacklog ? "border-amber-700/12 bg-amber-50/70" : "border-red-700/12 bg-red-50/70"}`}>
              <div className={`text-[7px] font-semibold uppercase tracking-[0.1em] ${isSourceGoverned && summary.remediation_verified ? "text-emerald-800/70" : isEventBacklog ? "text-amber-800/70" : "text-red-800/70"}`}>{isSourceGoverned ? "Remediation verification" : isEventBacklog ? "Backlog diagnosis" : "Failure fingerprint"}</div>
              <div className={`mt-1 break-words text-[9px] leading-4 ${isSourceGoverned && summary.remediation_verified ? "text-emerald-900" : isEventBacklog ? "text-amber-900" : "text-red-900"}`}>
                {isSourceGoverned
                  ? summary.remediation_explanation || "No source-specific remediation verifier is available."
                  : isEventBacklog
                    ? summary.diagnosis === "consumer_not_claiming"
                      ? "These events have never been claimed by a consumer. This is a delivery/consumer gap, not a retry failure. Operator case actions do not mark source events processed."
                      : summary.error_message || "The backlog contains attempted events and requires consumer/runtime investigation."
                    : summary.error_message || "No persisted error message"}
              </div>
            </div>

            {payload?.sourceResolution ? (
              <div className="mt-4 rounded-xl border border-emerald-700/12 bg-emerald-50 px-4 py-3 text-[8.5px] leading-4 text-emerald-900">Authoritative source closed · {payload.sourceResolution.resolvedCount} row{payload.sourceResolution.resolvedCount === 1 ? "" : "s"} · {when(payload.sourceResolution.resolvedAt)}.</div>
            ) : null}

            {isSystemAlert && affected.length ? (
              <div className="mt-5 overflow-hidden rounded-xl border border-black/[0.06] bg-[#FFFDF9]">
                <div className="border-b border-black/[0.05] px-4 py-3"><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Affected production records</div></div>
                {affected.map(row => (
                  <div key={row.dish_id} className="grid gap-2 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[1fr_120px_90px] sm:items-center">
                    <div><div className="text-[8px] font-medium text-[#514B45]">{row.dish_name || row.dish_id}</div><div className="mt-0.5 truncate text-[6.5px] text-[#AAA299]">{row.dish_id}</div></div>
                    <div className="text-[8px] text-[#6F6860]">{numeric(row.recipe_count)} recipe record{numeric(row.recipe_count) === 1 ? "" : "s"}</div>
                    <div className={`text-right text-[8px] font-semibold ${row.remediated ? "text-emerald-800" : "text-red-800"}`}>{row.remediated ? "verified" : "still missing"}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {isSecurityIncident && remediation.length ? (
              <div className="mt-5 overflow-hidden rounded-xl border border-black/[0.06] bg-[#FFFDF9]">
                <div className="border-b border-black/[0.05] px-4 py-3"><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Later successful workflow evidence</div></div>
                {remediation.slice(-8).reverse().map(row => (
                  <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[130px_1fr_90px] sm:items-center">
                    <div><div className="text-[8px] font-medium text-[#514B45]">{when(row.created_at)}</div><div className="mt-0.5 truncate text-[6.5px] text-[#AAA299]">{row.id}</div></div>
                    <div className="truncate text-[8px] text-[#6F6860]">{row.workflow} · {label(row.event)}</div>
                    <div className="text-right text-[8px] font-semibold text-emerald-800">success</div>
                  </div>
                ))}
              </div>
            ) : null}

            {!isEventBacklog && !isSourceGoverned ? (
              <div className="mt-5">
                <div className="flex items-end justify-between gap-3">
                  <div><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Impact trend</div><div className="mt-0.5 text-[9px] text-[#827B73]">Hourly matching failures across the authoritative 24-hour window.</div></div>
                  <div className="text-[8px] text-[#9A938A]">Peak {maxTrend}/h</div>
                </div>
                <div className="mt-3 flex h-24 items-end gap-1 rounded-xl border border-black/[0.06] bg-[#FFFDF9] px-3 pb-3 pt-4">
                  {trend.map((row, index) => {
                    const height = Math.max(4, Math.round((numeric(row.failures) / maxTrend) * 68));
                    return <div key={`${row.bucket}-${index}`} title={`${when(row.bucket)} · ${row.failures} failures`} className="min-w-[3px] flex-1 rounded-t bg-[#A56C45]/70" style={{ height }} />;
                  })}
                  {!trend.length ? <div className="m-auto text-[8px] text-[#A09990]">No trend buckets.</div> : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-xl border border-black/[0.06] bg-[#FFFDF9]">
              <div className="border-b border-black/[0.05] px-4 py-3"><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">{isEventBacklog ? "Queued source events" : isSystemAlert ? "Open source alerts" : isSecurityIncident ? "Open source incidents" : "Recent matching executions"}</div></div>
              {recent.slice(0, 12).map(row => isEventBacklog ? (
                <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[120px_1fr_90px_100px] sm:items-center">
                  <div><div className="text-[8px] font-medium text-[#514B45]">{when(row.created_at)}</div><div className="mt-0.5 truncate text-[6.5px] text-[#AAA299]">{row.id}</div></div>
                  <div><div className="truncate text-[8px] text-[#5E5750]">{label(row.event_type)}</div><div className="mt-0.5 text-[7px] text-[#9A938A]">{row.quotation_number || row.quotation_id || "No quotation reference"}</div></div>
                  <div className="text-[8px] text-[#6F6860]">{numeric(row.attempt_count)} attempts</div>
                  <div className="text-right text-[8px] text-[#6F6860]">{row.processing ? "processing" : "not claimed"}</div>
                </div>
              ) : isSystemAlert ? (
                <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[120px_110px_1fr] sm:items-center">
                  <div><div className="text-[8px] font-medium text-[#514B45]">{when(row.created_at)}</div><div className="mt-0.5 truncate text-[6.5px] text-[#AAA299]">{row.id}</div></div>
                  <div className="text-[8px] text-[#6F6860]">{label(row.alert_type)} · {label(row.severity)}</div>
                  <div className="truncate text-[8px] text-[#6F6860]">{row.message || row.source_id || "Source alert"}</div>
                </div>
              ) : isSecurityIncident ? (
                <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[120px_1fr_1fr] sm:items-center">
                  <div><div className="text-[8px] font-medium text-[#514B45]">{when(row.created_at)}</div><div className="mt-0.5 truncate text-[6.5px] text-[#AAA299]">{row.id}</div></div>
                  <div className="truncate text-[8px] text-[#6F6860]">{row.workflow || label(row.incident_type)}</div>
                  <div className="truncate text-[8px] text-[#8B4F3B]">{row.error || row.event || label(row.incident_status)}</div>
                </div>
              ) : (
                <div key={row.id} className="grid gap-2 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[120px_1fr_80px_80px] sm:items-center">
                  <div><div className="text-[8px] font-medium text-[#514B45]">{when(row.created_at)}</div><div className="mt-0.5 truncate text-[6.5px] text-[#AAA299]">{row.id}</div></div>
                  <div className="truncate text-[8px] text-[#6F6860]">{row.provider_model || row.operation || "execution"}</div>
                  <div className="text-[8px] text-[#8B4F3B]">{label(row.execution_status || row.status)}</div>
                  <div className="text-right text-[8px] text-[#6F6860]">{numeric(row.provider_latency_ms || row.latency_ms)} ms</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-black/[0.06] bg-[#FFFDF9] p-4">
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Governed case action</div>
              <div className="mt-1 text-[8px] leading-4 text-[#827B73]">{isSourceGoverned ? "Acknowledgement records operator ownership. Resolution is blocked unless Avantiqo can positively verify remediation, then both the governed case and authoritative source rows are closed with evidence." : "Acknowledgement changes only human workflow state. It does not modify authoritative source evidence. Resolution requires acknowledgement first; fresh evidence after resolution automatically reopens the case."}</div>
              {requiresNote ? (
                <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder={action === "RESOLVE" ? "What was fixed and how was it verified?" : "Why is this case being reopened?"} className="mt-3 w-full resize-none rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] text-[#45403A] outline-none focus:border-[#A37849]/40" />
              ) : null}
              {state.actionError ? <div className="mt-2 text-[8px] text-red-800">{state.actionError}</div> : null}
              <button type="button" disabled={state.actionLoading || (requiresNote && !t(note)) || (action === "RESOLVE" && isSourceGoverned && summary.remediation_verified !== true)} onClick={() => onAction(action)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-[#6F5034] px-4 text-[8px] font-semibold uppercase tracking-[0.09em] text-white disabled:cursor-not-allowed disabled:opacity-40">
                {state.actionLoading ? <Loader2 size={11} className="animate-spin" /> : null}{action === "RESOLVE" && isSourceGoverned ? "Verify & resolve" : `${label(action)} case`}
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-black/[0.06] bg-[#FFFDF9]">
              <div className="border-b border-black/[0.05] px-4 py-3"><div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Action history</div></div>
              {history.map(row => (
                <div key={row.id} className="grid gap-1 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 sm:grid-cols-[100px_120px_1fr]">
                  <div className="text-[7.5px] text-[#918A82]">{when(row.created_at)}</div>
                  <div className="text-[7.5px] font-semibold text-[#5A524B]">{label(row.action)} · {label(row.to_status)}</div>
                  <div className="text-[7.5px] text-[#817A72]">{row.note || "Workflow state recorded"}</div>
                </div>
              ))}
              {!history.length ? <div className="px-4 py-5 text-center text-[8px] text-[#9C958C]">No operator actions yet.</div> : null}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export default function PlatformOperatorControlTower({ control = {} }) {
  const router = useRouter();
  const signals = Array.isArray(control?.signals) ? control.signals : [];
  const coverage = control?.coverage || {};
  const counts = control?.counts || {};
  const [drawer, setDrawer] = useState({ open: false, loading: false, data: null, error: "", actionLoading: false, actionError: "" });
  const [note, setNote] = useState("");

  async function investigate(signal) {
    if (!canInvestigate(signal)) return;
    setNote("");
    setDrawer({ open: true, loading: true, data: null, error: "", actionLoading: false, actionError: "" });
    try {
      const response = await fetch(`/api/platform/admin/operator?signalKey=${encodeURIComponent(signal.id)}`, { cache: "no-store", credentials: "include" });
      const body = await response.json();
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Investigation failed");
      setDrawer(current => ({ ...current, loading: false, data: body }));
    } catch (error) {
      setDrawer(current => ({ ...current, loading: false, error: error?.message || "Investigation failed" }));
    }
  }

  async function act(action) {
    const signalKey = drawer.data?.signal?.signalKey;
    if (!signalKey) return;
    setDrawer(current => ({ ...current, actionLoading: true, actionError: "" }));
    try {
      const response = await fetch("/api/platform/admin/operator", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalKey, action, note: t(note) || null }),
      });
      const body = await response.json();
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Case action failed");
      setDrawer(current => ({ ...current, actionLoading: false, data: body }));
      setNote("");
      router.refresh();
    } catch (error) {
      setDrawer(current => ({ ...current, actionLoading: false, actionError: error?.message || "Case action failed" }));
    }
  }

  return (
    <>
      <section className="-mx-5 -mt-5 bg-[#F7F6F3] px-5 pb-2 pt-5 text-[#2A2723] lg:-mx-7 lg:-mt-6 lg:px-7 lg:pt-6">
        <div className="mx-auto max-w-[1760px] overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9]">
          <div className="grid gap-5 border-b border-black/[0.06] px-5 py-5 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-end">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#8A633C]">Avantiqo Platform · operator command</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-[22px] font-semibold tracking-[-0.035em] text-[#27231F]">What must be handled today</h1>
                <span className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${stateTone(control?.status)}`}>{label(control?.status || "unknown")}</span>
              </div>
              <p className="mt-1 max-w-4xl text-[9px] leading-5 text-[#8D867D]">Breached SLA first, then due today, then live impact. Every actionable condition carries an owner lane and source evidence; resolution cannot outrun authoritative remediation.</p>
            </div>
            <div className="grid grid-cols-6 overflow-hidden rounded-xl border border-black/[0.06] bg-[#FBF8F3]">
              {[["Breached", counts.breached || 0], ["Due today", counts.dueToday || 0], ["Critical", counts.critical || 0], ["High", counts.high || 0], ["Resolved", counts.resolved || 0], ["Sources", `${coverage.verified || 0}/${coverage.total || 0}`]].map(([name, value], index) => (
                <div key={name} className={`px-3 py-3 ${index ? "border-l border-black/[0.05]" : ""}`}><div className="text-[6.5px] font-semibold uppercase tracking-[0.11em] text-[#999188]">{name}</div><div className="mt-1 text-[14px] font-semibold text-[#403B35]">{value}</div></div>
              ))}
            </div>
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1fr)_315px]">
            <div className="divide-y divide-black/[0.05]">
              {signals.slice(0, 12).map((signal, index) => {
                const investigable = canInvestigate(signal);
                return (
                  <div key={signal.id || index} className={`${signal.workflowStatus === "RESOLVED" ? "bg-emerald-50/20" : ""} px-5 py-4`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.09em] ${severityTone(signal.severity)}`}><IconFor category={signal.category} />{label(signal.severity)}</span>
                          <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${workflowTone(signal.workflowStatus)}`}>{signal.reopenedByEvidence ? "reopened by evidence" : label(signal.workflowStatus)}</span>
                          <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${dueTone(signal.dueState)}`}>{label(signal.dueState)}</span>
                          <span className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#9A938A]">#{index + 1} · {signal.escalationLevel || "none"}</span>
                        </div>
                        <div className="mt-2 text-[12px] font-semibold tracking-[-0.01em] text-[#322E2A]">{signal.title}</div>
                        <div className="mt-1 max-w-5xl text-[8.5px] leading-4 text-[#777068]">{signal.summary}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        {investigable ? (
                          <button type="button" onClick={() => investigate(signal)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#A37849]/18 bg-[#FBF8F3] px-3 text-[7.5px] font-semibold uppercase tracking-[0.08em] text-[#6F5034] hover:bg-[#F3EDE5]">Investigate <ArrowRight size={10} /></button>
                        ) : (
                          <><div className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#9B948B]">Operator route</div><div className="mt-1 inline-flex items-center gap-1.5 text-[8px] font-semibold text-[#76583A]">Platform → {label(signal.target)} <ArrowRight size={10} /></div></>
                        )}
                        <div className="mt-1 text-[7.5px] text-[#A29A91]">{when(signal.occurredAt)}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <EvidenceCell name="Owner lane" value={signal.ownerLane} />
                      <EvidenceCell name="Age" value={signal.ageHours === null || signal.ageHours === undefined ? null : durationHours(signal.ageHours)} />
                      <EvidenceCell name="SLA" value={signal.slaHours ? `${signal.slaHours}h` : null} />
                      <EvidenceCell name="Due at" value={when(signal.dueAt)} />
                      {signal.evidence ? Object.entries(signal.evidence).slice(0, 4).map(([name, value]) => <EvidenceCell key={name} name={label(name)} value={value} />) : null}
                    </div>
                    <div className="mt-2 text-[6.5px] uppercase tracking-[0.09em] text-[#B0A89E]">Evidence source · {label(signal.source)}{investigable ? " · governed work queue" : " · read-only route"}</div>
                  </div>
                );
              })}
              {!signals.length ? <div className="flex items-center justify-center gap-2 px-5 py-12 text-[10px] text-emerald-800"><CheckCircle2 size={14} /> No ranked operator exceptions from the verified sources.</div> : null}
            </div>

            <aside className="border-t border-black/[0.06] bg-[#FBF8F3] p-4 xl:border-l xl:border-t-0">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><Database size={11} /> Evidence coverage</div>
              <div className="mt-1 text-[9px] leading-4 text-[#827B73]">A source is counted only when its read completed successfully. Missing or failed sources are shown as unverified, never silently treated as clear.</div>
              <div className="mt-4 space-y-2">{(coverage.sources || []).map((source, index) => <div key={`${source.name}-${index}`} className="rounded-lg border border-black/[0.06] bg-white px-3 py-2.5"><div className="flex items-center justify-between gap-2"><div className="text-[8px] font-semibold text-[#514B45]">{source.name}</div><span className={`text-[6.5px] font-semibold uppercase tracking-[0.08em] ${source.status === "verified" ? "text-emerald-800" : "text-amber-800"}`}>{label(source.status)}</span></div>{source.detail ? <div className="mt-1 text-[7px] leading-3 text-[#9C958C]">{source.detail}</div> : null}</div>)}</div>
              <div className="mt-4 rounded-lg border border-black/[0.06] bg-white px-3 py-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#A19A91]">Ranking contract</div><div className="mt-1 text-[8px] leading-4 text-[#746E66]">Breached SLA → due today → live impact → runtime truth → active blockers → stale debt.</div><div className="mt-2 text-[6.5px] uppercase tracking-[0.08em] text-[#B0A89E]">{label(control?.policy)}</div></div>
            </aside>
          </div>
        </div>
      </section>
      <InvestigationDrawer state={drawer} note={note} setNote={setNote} onClose={() => setDrawer(current => ({ ...current, open: false }))} onAction={act} />
    </>
  );
}