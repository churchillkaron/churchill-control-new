"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileClock,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

function statusTone(status) {
  if (status === "ATTENTION") return "border-red-700/15 bg-red-50 text-red-800";
  if (status === "REVIEW") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (status === "CLEAR") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function Metric({ label: metricLabel, value, detail, attention = false }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white/85 px-3.5 py-3">
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8C877F]">{metricLabel}</div>
      <div className={`mt-2 text-[22px] font-semibold tracking-[-0.035em] ${attention && Number(value) > 0 ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div>
      <div className="mt-0.5 text-[9px] text-[#99938A]">{detail}</div>
    </div>
  );
}

export default function FinancePracticeControlTower({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  async function load() {
    if (!organizationId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/practice-control", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load practice control");
      setState({ loading: false, error: "", data: body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load practice control", data: null });
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const summary = state.data?.summary || {};
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];

  if (state.loading && !state.data) {
    return (
      <section className="rounded-[24px] border border-[#A37849]/20 bg-[#F9F5EF] p-5">
        <div className="flex items-center gap-2 text-[12px] text-[#756F67]"><LoaderCircle size={15} className="animate-spin" /> Loading accounting practice workload…</div>
      </section>
    );
  }

  if (!clients.length && !state.error) return null;

  return (
    <section className="rounded-[24px] border border-[#A37849]/20 bg-[#F9F5EF] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A633C]"><ShieldCheck size={13} /> Practice control tower</div>
          <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em] text-[#2A2723]">Accounting firm portfolio</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#756F67]">Run the firm by exception: active work programs, client evidence, review clearance, blocked work and the next deadline across every engagement.</p>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#A37849]/20 bg-white/70 px-3 text-[10px] font-medium text-[#76583A] disabled:opacity-50">
          <RefreshCw size={12} className={state.loading ? "animate-spin" : ""} /> Refresh practice
        </button>
      </div>

      {state.error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[10px] text-red-800"><AlertTriangle size={13} className="mt-0.5" />{state.error}</div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Clients" value={summary.active_clients || 0} detail="Active engagements" />
        <Metric label="Programs" value={summary.active_runs || 0} detail="Active work programs" />
        <Metric label="Attention" value={summary.attention || 0} detail="Clients needing intervention" attention />
        <Metric label="Client wait" value={summary.waiting_on_client || 0} detail="Evidence or response pending" attention />
        <Metric label="Blocked" value={summary.blocked_work || 0} detail="Dependency blockers" attention />
        <Metric label="Ready" value={summary.ready_for_review || 0} detail="Waiting for reviewer" attention />
        <Metric label="Partner" value={summary.partner_clearance || 0} detail="Awaiting final clearance" attention />
        <Metric label="Overdue" value={summary.overdue || 0} detail={`${summary.client_requests || 0} open client requests`} attention />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-black/[0.07] bg-white/85">
        <div className="min-w-[1320px]">
          <div className="grid grid-cols-[minmax(200px,1.5fr)_145px_145px_100px_90px_100px_95px_95px_100px_110px_130px] gap-3 border-b border-black/[0.06] px-4 py-2.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">
            <span>Client</span><span>Preparer</span><span>Reviewer</span><span>Status</span><span>Programs</span><span>Client wait</span><span>Blocked</span><span>Ready</span><span>Overdue</span><span>Review points</span><span>Next deadline</span>
          </div>
          {clients.map((client) => (
            <div key={client.organization_id} className="grid grid-cols-[minmax(200px,1.5fr)_145px_145px_100px_90px_100px_95px_95px_100px_110px_130px] items-center gap-3 border-b border-black/[0.05] px-4 py-3 text-[11px] last:border-0">
              <div className="min-w-0">
                <div className="truncate font-semibold text-[#37342F]">{client.name}</div>
                <div className="mt-0.5 flex items-center gap-2 truncate text-[9px] text-[#908B83]">
                  <Users size={10} /> {client.service_package || "Engagement"}
                  <span>·</span>
                  <span>{client.workload?.open || 0} open</span>
                  {(client.workload?.client_requests || 0) > 0 ? <><span>·</span><span>{client.workload.client_requests} requests</span></> : null}
                  {client.workload?.changes_requested ? <><span>·</span><span className="text-[#9A533D]">{client.workload.changes_requested} changes</span></> : null}
                </div>
              </div>
              <div className="truncate text-[#66615A]">{client.assigned_accountant || "Unassigned"}</div>
              <div className="truncate text-[#66615A]">{client.assigned_reviewer || "Unassigned"}</div>
              <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] ${statusTone(client.status)}`}>{client.status === "CLEAR" ? <CheckCircle2 size={9} /> : <CircleDot size={9} />}{label(client.status)}</span></div>
              <div className="flex items-center gap-1.5 tabular-nums text-[#5E5952]"><FileClock size={11} className="text-[#9A744B]" />{client.workload?.active_runs || 0}</div>
              <div className={`flex items-center gap-1.5 tabular-nums ${(client.workload?.waiting_on_client || 0) > 0 ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}><UserRoundCheck size={11} />{client.workload?.waiting_on_client || 0}</div>
              <div className={`tabular-nums ${(client.workload?.blocked_work || 0) > 0 ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}>{client.workload?.blocked_work || 0}</div>
              <div className="tabular-nums text-[#5E5952]">{client.workload?.ready_for_review || 0}</div>
              <div className={`tabular-nums ${(client.workload?.overdue || 0) > 0 ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}>{client.workload?.overdue || 0}</div>
              <div className={`tabular-nums ${(client.workload?.open_review_points || 0) > 0 ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}>{client.workload?.open_review_points || 0}</div>
              <div className="flex items-center gap-1.5 text-[#5E5952]"><CalendarClock size={11} className="text-[#9A744B]" />{client.next_deadline || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
