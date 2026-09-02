"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FileClock,
  FolderOpen,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

import FinanceEngagementFile from "@/components/workspace/finance/FinanceEngagementFile";

function statusTone(status) {
  if (status === "ATTENTION") return "border-red-700/15 bg-red-50 text-red-800";
  if (status === "REVIEW") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (status === "CLEAR") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function capacityTone(risk) {
  if (risk === "OVERLOADED") return "text-[#9A533D]";
  if (risk === "HIGH") return "text-[#9A6A36]";
  if (risk === "WATCH") return "text-[#7D7144]";
  return "text-[#58705B]";
}

function recurringTone(status) {
  if (status === "READY_TO_CREATE") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (status === "ALREADY_EXISTS") return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
  return "border-amber-700/15 bg-amber-50 text-amber-900";
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
  const [state, setState] = useState({ loading: true, error: "", data: null, capacity: null, recurring: null });
  const [selectedEngagementId, setSelectedEngagementId] = useState(null);
  const [materializingKey, setMaterializingKey] = useState(null);
  const [materializeNotice, setMaterializeNotice] = useState(null);

  async function load() {
    if (!organizationId) return;
    try {
      setState((current) => ({ ...current, loading: true, error: "" }));
      const practiceUrl = new URL("/api/workspace/finance/practice-control", window.location.origin);
      practiceUrl.searchParams.set("organizationId", organizationId);
      const capacityUrl = new URL("/api/workspace/finance/practice-capacity", window.location.origin);
      capacityUrl.searchParams.set("organizationId", organizationId);
      capacityUrl.searchParams.set("days", "14");
      const recurringUrl = new URL("/api/workspace/finance/recurring-plan", window.location.origin);
      recurringUrl.searchParams.set("organizationId", organizationId);
      recurringUrl.searchParams.set("days", "90");

      const [practiceResponse, capacityResponse, recurringResponse] = await Promise.all([
        fetch(practiceUrl.toString(), { cache: "no-store", credentials: "include" }),
        fetch(capacityUrl.toString(), { cache: "no-store", credentials: "include" }),
        fetch(recurringUrl.toString(), { cache: "no-store", credentials: "include" }),
      ]);
      const [practiceBody, capacityBody, recurringBody] = await Promise.all([
        practiceResponse.json().catch(() => ({})),
        capacityResponse.json().catch(() => ({})),
        recurringResponse.json().catch(() => ({})),
      ]);
      if (!practiceResponse.ok || practiceBody?.success === false) throw new Error(practiceBody?.error || "Unable to load practice control");

      const warnings = [];
      if (!capacityResponse.ok || capacityBody?.success === false) warnings.push(capacityBody?.error || "Capacity planning is unavailable");
      if (!recurringResponse.ok || recurringBody?.success === false) warnings.push(recurringBody?.error || "Recurring cycle planning is unavailable");

      setState({
        loading: false,
        error: warnings.join(" · "),
        data: practiceBody,
        capacity: capacityResponse.ok && capacityBody?.success !== false ? capacityBody : null,
        recurring: recurringResponse.ok && recurringBody?.success !== false ? recurringBody : null,
      });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Unable to load practice control", data: null, capacity: null, recurring: null });
    }
  }

  async function materializeRecurringCycle(candidate) {
    if (!candidate?.idempotency_key || candidate.status !== "READY_TO_CREATE" || materializingKey) return;
    try {
      setMaterializingKey(candidate.idempotency_key);
      setMaterializeNotice(null);
      const response = await fetch("/api/workspace/finance/recurring-materialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          idempotencyKey: candidate.idempotency_key,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to create accounting cycle");

      const alreadyExists = body?.result?.status === "ALREADY_EXISTS" || body?.materialized === false;
      setMaterializeNotice({
        tone: "success",
        text: alreadyExists
          ? `${candidate.client_name || "Client"}: this accounting cycle already exists. Nothing was duplicated and no client message was sent.`
          : `${candidate.client_name || "Client"}: accounting cycle created as internal work only. No client message was sent.`,
      });
      await load();
    } catch (error) {
      setMaterializeNotice({ tone: "error", text: error?.message || "Unable to create accounting cycle" });
    } finally {
      setMaterializingKey(null);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const summary = state.data?.summary || {};
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const capacitySummary = state.capacity?.summary || {};
  const people = Array.isArray(state.capacity?.people) ? state.capacity.people : [];
  const recurringSummary = state.recurring?.summary || {};
  const recurringCandidates = Array.isArray(state.recurring?.candidates) ? state.recurring.candidates : [];
  const recurringReady = recurringCandidates.filter((candidate) => candidate.status === "READY_TO_CREATE");
  const recurringBlockers = recurringCandidates.filter((candidate) => !["READY_TO_CREATE", "ALREADY_EXISTS"].includes(candidate.status));

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
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-[#756F67]">Run the firm by exception: active work programs, client evidence, review clearance, capacity pressure, recurring-cycle readiness and the next deadline across every engagement.</p>
        </div>
        <button type="button" onClick={load} disabled={state.loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#A37849]/20 bg-white/70 px-3 text-[10px] font-medium text-[#76583A] disabled:opacity-50">
          <RefreshCw size={12} className={state.loading ? "animate-spin" : ""} /> Refresh practice
        </button>
      </div>

      {state.error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-700/15 bg-amber-50 p-3 text-[10px] text-amber-900"><AlertTriangle size={13} className="mt-0.5" />{state.error}</div>
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

      {state.capacity ? (
        <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A633C]"><Gauge size={12} /> 14-day capacity</div>
              <div className="mt-1 text-[12px] text-[#716B63]">Budgeted engagement work against targeted staff availability.</div>
            </div>
            <div className="text-[9px] text-[#99938A]">{state.capacity?.horizon?.start} – {state.capacity?.horizon?.end}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Metric label="Available" value={`${capacitySummary.available_hours || 0}h`} detail="Target capacity" />
            <Metric label="Assigned" value={`${capacitySummary.assigned_hours || 0}h`} detail={`${capacitySummary.utilization || 0}% utilization`} />
            <Metric label="Overloaded" value={capacitySummary.overloaded_people || 0} detail="People over target capacity" attention />
            <Metric label="Unassigned" value={`${capacitySummary.unassigned_hours || 0}h`} detail={`${capacitySummary.unassigned_items || 0} work items`} attention />
            <Metric label="Overdue work" value={capacitySummary.overdue_items || 0} detail="Open items past due" attention />
          </div>
          {people.length ? (
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[minmax(180px,1fr)_110px_105px_105px_95px_90px] gap-3 border-b border-black/[0.06] px-2 py-2 text-[8px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">
                  <span>Team member</span><span>Role</span><span>Assigned</span><span>Available</span><span>Load</span><span>Risk</span>
                </div>
                {people.slice(0, 8).map((person) => (
                  <div key={person.staff_account_id} className="grid grid-cols-[minmax(180px,1fr)_110px_105px_105px_95px_90px] gap-3 border-b border-black/[0.05] px-2 py-2.5 text-[10px] last:border-0">
                    <div className="truncate font-medium text-[#37342F]">{person.name}</div>
                    <div className="truncate text-[#716B63]">{label(person.role)}</div>
                    <div className="tabular-nums text-[#5E5952]">{person.assigned_hours}h</div>
                    <div className="tabular-nums text-[#5E5952]">{person.available_hours}h</div>
                    <div className="tabular-nums text-[#5E5952]">{person.utilization}%</div>
                    <div className={`font-semibold ${capacityTone(person.risk)}`}>{label(person.risk)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.recurring ? (
        <div className="mt-4 rounded-2xl border border-black/[0.07] bg-white/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A633C]"><Repeat2 size={12} /> 90-day recurring cycle plan</div>
              <div className="mt-1 text-[12px] text-[#716B63]">Avantiqo recomputes each candidate on the server before creation. A cycle creates internal accounting work and draft evidence requests only; it never sends a client message.</div>
            </div>
            <div className="rounded-full border border-black/[0.07] bg-[#FAF9F7] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#7D776F]">Governed creation · no external messages</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Metric label="Planned" value={recurringSummary.total || 0} detail="90-day candidates" />
            <Metric label="Ready" value={recurringSummary.ready_to_create || 0} detail="Safe to materialize" />
            <Metric label="Entity setup" value={recurringSummary.blocked_entity_configuration || 0} detail="Legal entity missing" attention />
            <Metric label="Period setup" value={recurringSummary.blocked_period_configuration || 0} detail="Financial period missing" attention />
            <Metric label="Existing" value={recurringSummary.already_exists || 0} detail="Idempotency protected" />
          </div>

          {materializeNotice ? (
            <div className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-[10px] ${materializeNotice.tone === "error" ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>
              {materializeNotice.tone === "error" ? <AlertTriangle size={13} className="mt-0.5" /> : <CheckCircle2 size={13} className="mt-0.5" />}
              {materializeNotice.text}
            </div>
          ) : null}

          {recurringReady.length ? (
            <div className="mt-3">
              <div className="mb-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">Ready for controlled creation</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {recurringReady.slice(0, 9).map((candidate) => {
                  const isCreating = materializingKey === candidate.idempotency_key;
                  return (
                    <div key={candidate.idempotency_key} className="rounded-xl border border-emerald-700/10 bg-emerald-50/35 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[10px] font-semibold text-[#403C37]">{candidate.client_name || "Client"}</div>
                          <div className="mt-0.5 text-[8px] text-[#99938A]">{candidate.template_name || label(candidate.service_key || candidate.cadence)} · due {candidate.due_at ? String(candidate.due_at).slice(0, 10) : "—"}</div>
                        </div>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase ${recurringTone(candidate.status)}`}>{label(candidate.status)}</span>
                      </div>
                      <div className="mt-2 text-[9px] leading-4 text-[#716B63]">Creates the governed work program and draft client evidence requests. No email, reminder or external client message is sent.</div>
                      <button
                        type="button"
                        onClick={() => materializeRecurringCycle(candidate)}
                        disabled={Boolean(materializingKey)}
                        className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#6E8A70]/20 bg-white px-2.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#58705B] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCreating ? <LoaderCircle size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                        {isCreating ? "Creating…" : "Create accounting cycle"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {recurringBlockers.length ? (
            <div className="mt-3">
              <div className="mb-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A867F]">Configuration blockers</div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {recurringBlockers.slice(0, 9).map((candidate) => (
                  <div key={candidate.idempotency_key} className="rounded-xl border border-black/[0.06] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate text-[10px] font-semibold text-[#403C37]">{candidate.client_name || "Client"}</div><div className="mt-0.5 text-[8px] text-[#99938A]">{label(candidate.service_key || candidate.cadence || "configuration")}</div></div>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase ${recurringTone(candidate.status)}`}>{label(candidate.status)}</span>
                    </div>
                    {candidate.blockers?.[0] ? <div className="mt-2 text-[9px] leading-4 text-[#7D6A50]">{candidate.blockers[0]}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-black/[0.07] bg-white/85">
        <div className="min-w-[1430px]">
          <div className="grid grid-cols-[minmax(240px,1.5fr)_145px_145px_100px_90px_100px_95px_95px_100px_110px_130px_95px] gap-3 border-b border-black/[0.06] px-4 py-2.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">
            <span>Client</span><span>Preparer</span><span>Reviewer</span><span>Status</span><span>Programs</span><span>Client wait</span><span>Blocked</span><span>Ready</span><span>Overdue</span><span>Review points</span><span>Next deadline</span><span>File</span>
          </div>
          {clients.map((client) => (
            <div key={client.organization_id} className={`grid grid-cols-[minmax(240px,1.5fr)_145px_145px_100px_90px_100px_95px_95px_100px_110px_130px_95px] items-center gap-3 border-b border-black/[0.05] px-4 py-3 text-[11px] last:border-0 ${selectedEngagementId === client.engagement_id ? "bg-[#A37849]/[0.05]" : ""}`}>
              <div className="min-w-0">
                <button type="button" onClick={() => setSelectedEngagementId(client.engagement_id)} className="block max-w-full text-left">
                  <div className="truncate font-semibold text-[#37342F] hover:text-[#8A633C]">{client.name}</div>
                </button>
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
              <button type="button" onClick={() => setSelectedEngagementId(client.engagement_id)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#A37849]/20 bg-[#A37849]/[0.05] px-2 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#76583A] hover:bg-[#A37849]/[0.1]"><FolderOpen size={10} /> Open</button>
            </div>
          ))}
        </div>
      </div>

      {selectedEngagementId ? (
        <FinanceEngagementFile organizationId={organizationId} engagementId={selectedEngagementId} onClose={() => setSelectedEngagementId(null)} />
      ) : null}
    </section>
  );
}