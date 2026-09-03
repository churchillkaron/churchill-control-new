"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FolderOpen,
  Gauge,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Repeat2,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";

import FinanceEngagementFile from "@/components/workspace/finance/FinanceEngagementFile";

const TABS = [
  { id: "today", label: "Today", icon: Clock3 },
  { id: "clients", label: "Clients", icon: Users },
  { id: "work", label: "Work", icon: ListChecks },
  { id: "capacity", label: "Capacity", icon: Gauge },
  { id: "cycles", label: "Cycles", icon: Repeat2 },
];

const CLIENT_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "ATTENTION", label: "Attention" },
  { id: "REVIEW", label: "Review" },
  { id: "WAITING", label: "Client wait" },
  { id: "OVERDUE", label: "Overdue" },
];

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function statusTone(status) {
  const value = String(status || "").toUpperCase();
  if (["ATTENTION", "BLOCKED", "CHANGES_REQUESTED", "OVERLOADED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["REVIEW", "READY_FOR_REVIEW", "REVIEWED", "HIGH", "WATCH"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["CLEAR", "COMPLETE", "CLEARED", "HEALTHY", "ALREADY_EXISTS"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function count(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function SummaryButton({ label: metricLabel, value, detail, attention = false, active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3.5 py-3 text-left transition ${active ? "border-[#A37849]/35 bg-[#A37849]/[0.08]" : "border-black/[0.07] bg-white hover:border-[#A37849]/25 hover:bg-[#FFFCF8]"}`}
    >
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8C877F]">{metricLabel}</div>
      <div className={`mt-2 text-[22px] font-semibold tracking-[-0.035em] ${attention && count(value) > 0 ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div>
      <div className="mt-0.5 text-[9px] text-[#99938A]">{detail}</div>
    </button>
  );
}

function LoadingRow({ text = "Loading accounting work…" }) {
  return <div className="flex min-h-[180px] items-center justify-center text-[11px] text-[#817D76]"><LoaderCircle size={15} className="mr-2 animate-spin text-[#A37849]" />{text}</div>;
}

function EmptyState({ title, detail }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white px-5 py-8 text-center">
      <CheckCircle2 size={18} className="mx-auto text-[#6F7E68]" />
      <div className="mt-2 text-[12px] font-semibold text-[#3D3934]">{title}</div>
      <div className="mx-auto mt-1 max-w-xl text-[10px] leading-5 text-[#8B867E]">{detail}</div>
    </div>
  );
}

function ClientTable({ clients, onOpen }) {
  if (!clients.length) return <EmptyState title="Nothing in this view" detail="Change the filter or search another client." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.07] bg-white">
      <div className="min-w-[1040px]">
        <div className="grid grid-cols-[minmax(220px,1.5fr)_150px_150px_105px_75px_80px_80px_115px] gap-3 border-b border-black/[0.06] px-4 py-2.5 text-[8px] font-medium uppercase tracking-[0.12em] text-[#8A867F]">
          <span>Client</span><span>Preparer</span><span>Reviewer</span><span>Next due</span><span>Open</span><span>Client wait</span><span>Review</span><span>Status</span>
        </div>
        {clients.map((client) => {
          const reviewCount = count(client.workload?.ready_for_review) + count(client.workload?.reviewed_pending_partner);
          return (
            <button
              type="button"
              key={client.engagement_id}
              onClick={() => onOpen(client.engagement_id)}
              className="group grid w-full grid-cols-[minmax(220px,1.5fr)_150px_150px_105px_75px_80px_80px_115px] items-center gap-3 border-b border-black/[0.05] px-4 py-3 text-left text-[10px] transition last:border-0 hover:bg-[#FAF8F4]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-[#37342F] group-hover:text-[#8A633C]">{client.name}</span>
                  <ChevronRight size={11} className="shrink-0 text-[#B2ADA5] group-hover:text-[#A37849]" />
                </div>
                <div className="mt-0.5 truncate text-[8px] text-[#99938A]">{client.service_package || "Accounting engagement"}</div>
              </div>
              <div className="truncate text-[#66615A]">{client.assigned_accountant || "Unassigned"}</div>
              <div className="truncate text-[#66615A]">{client.assigned_reviewer || "Unassigned"}</div>
              <div className="flex items-center gap-1.5 tabular-nums text-[#5E5952]"><CalendarClock size={10} className="text-[#9A744B]" />{shortDate(client.next_deadline)}</div>
              <div className="tabular-nums text-[#5E5952]">{count(client.workload?.open)}</div>
              <div className={`tabular-nums ${count(client.workload?.waiting_on_client) > 0 ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}>{count(client.workload?.waiting_on_client)}</div>
              <div className={`tabular-nums ${reviewCount > 0 ? "font-semibold text-[#8A633C]" : "text-[#5E5952]"}`}>{reviewCount}</div>
              <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.08em] ${statusTone(client.status)}`}>{client.status === "CLEAR" ? <CheckCircle2 size={8} /> : <CircleDot size={8} />}{label(client.status)}</span></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FinancePracticeControlTower({ organizationId }) {
  const [practice, setPractice] = useState({ loading: true, error: "", data: null });
  const [activeView, setActiveView] = useState("today");
  const [clientFilter, setClientFilter] = useState("ATTENTION");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedEngagementId, setSelectedEngagementId] = useState(null);
  const [workPrograms, setWorkPrograms] = useState(null);
  const [workLoading, setWorkLoading] = useState(false);
  const [workError, setWorkError] = useState("");
  const [capacity, setCapacity] = useState(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState("");
  const [capacityWindowDays, setCapacityWindowDays] = useState(30);
  const [recurring, setRecurring] = useState(null);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringError, setRecurringError] = useState("");
  const [materializingKey, setMaterializingKey] = useState(null);
  const [materializeNotice, setMaterializeNotice] = useState(null);

  async function loadPractice() {
    if (!organizationId) return;
    try {
      setPractice((current) => ({ ...current, loading: true, error: "" }));
      const url = new URL("/api/workspace/finance/practice-control", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load accounting practice");
      setPractice({ loading: false, error: "", data: body });
    } catch (error) {
      setPractice({ loading: false, error: error?.message || "Unable to load accounting practice", data: null });
    }
  }

  async function loadWorkPrograms(force = false) {
    if (!organizationId || (workPrograms && !force) || workLoading) return;
    try {
      setWorkLoading(true);
      setWorkError("");
      const url = new URL("/api/workspace/finance/work-programs", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load accounting work");
      setWorkPrograms(body);
    } catch (error) {
      setWorkError(error?.message || "Unable to load accounting work");
    } finally {
      setWorkLoading(false);
    }
  }

  async function loadCapacity(force = false) {
    if (!organizationId || (capacity && !force) || capacityLoading) return;
    try {
      setCapacityLoading(true);
      setCapacityError("");
      const url = new URL("/api/workspace/finance/practice-capacity", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("days", "14");
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load practice capacity");
      setCapacity(body);
    } catch (error) {
      setCapacityError(error?.message || "Unable to load practice capacity");
    } finally {
      setCapacityLoading(false);
    }
  }

  async function loadRecurring(force = false) {
    if (!organizationId || (recurring && !force) || recurringLoading) return;
    try {
      setRecurringLoading(true);
      setRecurringError("");
      const url = new URL("/api/workspace/finance/recurring-plan", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("days", "90");
      const response = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load recurring cycles");
      setRecurring(body);
    } catch (error) {
      setRecurringError(error?.message || "Unable to load recurring cycles");
    } finally {
      setRecurringLoading(false);
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
        body: JSON.stringify({ organizationId, idempotencyKey: candidate.idempotency_key }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to create accounting cycle");
      const alreadyExists = body?.result?.status === "ALREADY_EXISTS" || body?.materialized === false;
      setMaterializeNotice({
        tone: "success",
        text: alreadyExists
          ? `${candidate.client_name || "Client"}: this cycle already exists. Nothing was duplicated.`
          : `${candidate.client_name || "Client"}: accounting cycle created. No client message was sent.`,
      });
      await Promise.all([loadPractice(), loadRecurring(true), loadWorkPrograms(true)]);
    } catch (error) {
      setMaterializeNotice({ tone: "error", text: error?.message || "Unable to create accounting cycle" });
    } finally {
      setMaterializingKey(null);
    }
  }

  useEffect(() => {
    loadPractice();
  }, [organizationId]);

  useEffect(() => {
    if (activeView === "work") loadWorkPrograms();
    if (activeView === "capacity") loadCapacity();
    if (activeView === "cycles") loadRecurring();
  }, [activeView, organizationId]);

  const summary = practice.data?.summary || {};
  const clients = Array.isArray(practice.data?.clients) ? practice.data.clients : [];
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.organization_id, client])), [clients]);

  const filteredClients = useMemo(() => {
    const needle = clientSearch.trim().toLowerCase();
    return clients.filter((client) => {
      if (needle) {
        const haystack = [client.name, client.service_package, client.assigned_accountant, client.assigned_reviewer].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (clientFilter === "ATTENTION") return client.status === "ATTENTION";
      if (clientFilter === "REVIEW") return count(client.workload?.ready_for_review) + count(client.workload?.reviewed_pending_partner) > 0;
      if (clientFilter === "WAITING") return count(client.workload?.waiting_on_client) > 0;
      if (clientFilter === "OVERDUE") return count(client.workload?.overdue) > 0;
      return true;
    });
  }, [clients, clientFilter, clientSearch]);

  const focusClients = useMemo(() => {
    const actionable = clients.filter((client) => client.status !== "CLEAR" || count(client.workload?.active_runs) > 0);
    return (actionable.length ? actionable : clients).slice(0, 10);
  }, [clients]);

  const workRows = useMemo(() => {
    const rows = [];
    for (const run of workPrograms?.runs || []) {
      const client = clientMap.get(run.organization_id);
      for (const item of run.work_items || []) {
        if (["COMPLETE", "SKIPPED"].includes(String(item.status || "").toUpperCase())) continue;
        rows.push({
          ...item,
          engagement_id: run.engagement_id,
          run_status: run.status,
          client_name: client?.name || "Client organization",
          assigned_accountant: client?.assigned_accountant || null,
        });
      }
    }
    return rows.sort((a, b) => String(a.due_at || "9999-12-31").localeCompare(String(b.due_at || "9999-12-31")) || Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
  }, [workPrograms, clientMap]);

  function openFilteredClients(filter) {
    setClientFilter(filter);
    setClientSearch("");
    setActiveView("clients");
  }

  if (practice.loading && !practice.data) {
    return <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-5"><LoadingRow text="Preparing accounting practice workspace…" /></section>;
  }

  if (practice.error && !practice.data) {
    return (
      <section className="rounded-[24px] border border-red-700/15 bg-red-50 p-5 text-[11px] text-red-800">
        <div className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5" /><div><div className="font-semibold">Accounting practice workspace could not load</div><div className="mt-1">{practice.error}</div></div></div>
      </section>
    );
  }

  if (selectedEngagementId) {
    return (
      <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-black/[0.06] pb-3">
          <button type="button" onClick={() => setSelectedEngagementId(null)} className="inline-flex items-center gap-2 text-[10px] font-semibold text-[#76583A] hover:text-[#4E3822]">← Back to practice</button>
          <div className="text-[9px] text-[#99938A]">Client file · work · evidence · review</div>
        </div>
        <FinanceEngagementFile organizationId={organizationId} engagementId={selectedEngagementId} onClose={() => setSelectedEngagementId(null)} />
      </section>
    );
  }

  return (
    <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><ShieldCheck size={12} /> Accounting practice</div>
          <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em] text-[#2A2723]">Your work, clients and review in one place</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#756F67]">Designed for daily accounting work: start with what needs attention, open the client file, finish the procedure, review the evidence, and return to the same queue.</p>
        </div>
        <button type="button" onClick={() => loadPractice()} disabled={practice.loading} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-[#A37849]/20 bg-white px-3 text-[9px] font-semibold text-[#76583A] disabled:opacity-50 lg:self-auto"><RefreshCw size={11} className={practice.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-black/[0.07] pb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveView(tab.id)} className={`inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[10px] font-semibold transition ${active ? "border-[#A37849] text-[#5F452D]" : "border-transparent text-[#817D76] hover:text-[#514D47]"}`}>
              <Icon size={11} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeView === "today" ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            <SummaryButton label="Attention" value={summary.attention || 0} detail="Clients needing action" attention onClick={() => openFilteredClients("ATTENTION")} />
            <SummaryButton label="Ready for review" value={summary.ready_for_review || 0} detail={`${summary.partner_clearance || 0} partner clearance`} attention onClick={() => openFilteredClients("REVIEW")} />
            <SummaryButton label="Client wait" value={summary.waiting_on_client || 0} detail="Evidence or response pending" attention onClick={() => openFilteredClients("WAITING")} />
            <SummaryButton label="Overdue" value={summary.overdue || 0} detail="Work past due" attention onClick={() => openFilteredClients("OVERDUE")} />
            <SummaryButton label="Active clients" value={summary.active_clients || 0} detail={`${summary.active_runs || 0} active programs`} onClick={() => openFilteredClients("ALL")} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <div>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div><div className="text-[10px] font-semibold text-[#403C37]">Priority clients</div><div className="mt-0.5 text-[9px] text-[#918B83]">Sorted by risk and next deadline. Open a client without losing your place.</div></div>
                <button type="button" onClick={() => openFilteredClients("ALL")} className="text-[9px] font-semibold text-[#8A633C]">All clients</button>
              </div>
              <ClientTable clients={focusClients} onOpen={setSelectedEngagementId} />
            </div>

            <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A867F]">Today’s focus</div>
              <div className="mt-3 divide-y divide-black/[0.06]">
                {[
                  ["Blocked work", summary.blocked_work || 0, "Resolve dependencies before more work is started."],
                  ["Open review points", summary.open_review_points || 0, "Clear questions where the accounting evidence is incomplete."],
                  ["Partner clearance", summary.partner_clearance || 0, "Final review decisions waiting for sign-off."],
                  ["Client requests", summary.client_requests || 0, "Evidence or answers currently expected from clients."],
                ].map(([title, value, detail]) => (
                  <div key={title} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div><div className="text-[10px] font-semibold text-[#4A4640]">{title}</div><div className="mt-0.5 text-[8px] leading-4 text-[#979189]">{detail}</div></div>
                    <div className={`tabular-nums text-[18px] font-semibold ${count(value) > 0 ? "text-[#9A533D]" : "text-[#6F7E68]"}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeView === "clients" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-1 overflow-x-auto">
              {CLIENT_FILTERS.map((filter) => (
                <button key={filter.id} type="button" onClick={() => setClientFilter(filter.id)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${clientFilter === filter.id ? "border-[#A37849]/25 bg-[#A37849]/[0.08] text-[#76583A]" : "border-black/[0.07] bg-white text-[#817D76]"}`}>{filter.label}</button>
              ))}
            </div>
            <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 xl:w-[300px]"><Search size={12} className="text-[#A29D95]" /><input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search client or accountant" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
          </div>
          <div className="text-[9px] text-[#918B83]">{filteredClients.length} client{filteredClients.length === 1 ? "" : "s"} in this view</div>
          <ClientTable clients={filteredClients} onOpen={setSelectedEngagementId} />
        </div>
      ) : null}

      {activeView === "work" ? (
        <div className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><div className="text-[10px] font-semibold text-[#403C37]">Open accounting work</div><div className="mt-0.5 text-[9px] text-[#918B83]">One queue across clients, ordered by due date. Completed and skipped procedures stay out of the working view.</div></div>
            <button type="button" onClick={() => loadWorkPrograms(true)} disabled={workLoading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><RefreshCw size={10} className={workLoading ? "animate-spin" : ""} /> Refresh</button>
          </div>
          {workError ? <div className="mb-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800">{workError}</div> : null}
          {workLoading && !workPrograms ? <LoadingRow /> : workRows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-black/[0.07] bg-white">
              <div className="min-w-[920px]">
                <div className="grid grid-cols-[105px_minmax(190px,1.1fr)_minmax(240px,1.4fr)_105px_120px_80px] gap-3 border-b border-black/[0.06] px-4 py-2.5 text-[8px] font-medium uppercase tracking-[0.12em] text-[#8A867F]"><span>Due</span><span>Client</span><span>Procedure</span><span>Role</span><span>Status</span><span>File</span></div>
                {workRows.slice(0, 250).map((item) => (
                  <div key={item.id} className="grid grid-cols-[105px_minmax(190px,1.1fr)_minmax(240px,1.4fr)_105px_120px_80px] items-center gap-3 border-b border-black/[0.05] px-4 py-2.5 text-[10px] last:border-0">
                    <div className={`tabular-nums ${item.due_at && shortDate(item.due_at) < new Date().toISOString().slice(0, 10) ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}>{shortDate(item.due_at)}</div>
                    <div className="truncate font-medium text-[#4A4640]">{item.client_name}</div>
                    <div className="min-w-0"><div className="truncate font-medium text-[#37342F]">{item.title}</div><div className="mt-0.5 truncate text-[8px] text-[#99938A]">{item.assigned_accountant || "Unassigned preparer"}</div></div>
                    <div className="text-[#716B63]">{label(item.required_role)}</div>
                    <div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${statusTone(item.status)}`}>{label(item.status)}</span></div>
                    <button type="button" onClick={() => setSelectedEngagementId(item.engagement_id)} className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-[#A37849]/20 bg-[#A37849]/[0.04] px-2 text-[7px] font-semibold uppercase tracking-[0.06em] text-[#76583A]"><FolderOpen size={9} /> Open</button>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState title="No open accounting procedures" detail="The work queue is clear for the currently materialized accounting programs." />}
        </div>
      ) : null}

      {activeView === "capacity" ? (
        <div className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold text-[#403C37]">Team capacity</div><div className="mt-0.5 text-[9px] text-[#918B83]">Planning lives here so it does not interrupt daily accounting work.</div></div><button type="button" onClick={() => loadCapacity(true)} disabled={capacityLoading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><RefreshCw size={10} className={capacityLoading ? "animate-spin" : ""} /> Refresh</button></div>
          {capacityError ? <div className="mb-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800">{capacityError}</div> : null}
          {capacityLoading && !capacity ? <LoadingRow text="Loading team capacity…" /> : capacity ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <SummaryButton label="Available" value={`${capacity.summary?.available_hours || 0}h`} detail="14-day target capacity" />
                <SummaryButton label="Assigned" value={`${capacity.summary?.assigned_hours || 0}h`} detail={`${capacity.summary?.utilization || 0}% utilization`} />
                <SummaryButton label="Overloaded" value={capacity.summary?.overloaded_people || 0} detail="People over target" attention />
                <SummaryButton label="Unassigned" value={`${capacity.summary?.unassigned_hours || 0}h`} detail={`${capacity.summary?.unassigned_items || 0} procedures`} attention />
                <SummaryButton label="Overdue" value={capacity.summary?.overdue_items || 0} detail="Open work past due" attention />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-black/[0.07] bg-white">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[minmax(190px,1fr)_110px_100px_100px_90px_100px] gap-3 border-b border-black/[0.06] px-4 py-2.5 text-[8px] font-medium uppercase tracking-[0.12em] text-[#8A867F]"><span>Team member</span><span>Role</span><span>Assigned</span><span>Available</span><span>Load</span><span>Risk</span></div>
                  {(capacity.people || []).map((person) => (
                    <div key={person.staff_account_id} className="grid grid-cols-[minmax(190px,1fr)_110px_100px_100px_90px_100px] gap-3 border-b border-black/[0.05] px-4 py-2.5 text-[10px] last:border-0"><div className="truncate font-medium text-[#37342F]">{person.name}</div><div className="truncate text-[#716B63]">{label(person.role)}</div><div className="tabular-nums text-[#5E5952]">{person.assigned_hours}h</div><div className="tabular-nums text-[#5E5952]">{person.available_hours}h</div><div className="tabular-nums text-[#5E5952]">{person.utilization}%</div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${statusTone(person.risk)}`}>{label(person.risk)}</span></div></div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">Forward demand</div><div className="mt-1 text-[9px] text-[#918B83]">Committed work plus governed recurring demand. Nothing is created from this forecast.</div></div><div className="inline-flex rounded-lg border border-black/[0.07] bg-[#FAF9F7] p-1">{[30, 60, 90].map((days) => <button key={days} type="button" onClick={() => setCapacityWindowDays(days)} className={`h-7 rounded-md px-2.5 text-[8px] font-semibold ${capacityWindowDays === days ? "bg-white text-[#76583A] shadow-sm" : "text-[#8C877F]"}`}>{days}d</button>)}</div></div>
                {capacity.forecast?.windows?.[String(capacityWindowDays)] ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                    {(() => { const forecast = capacity.forecast.windows[String(capacityWindowDays)].summary || {}; return [
                      ["Available", `${forecast.available_hours || 0}h`],
                      ["Committed", `${forecast.committed_hours || 0}h`],
                      ["Forecast", `${forecast.forecast_hours || 0}h`],
                      ["Projected load", `${forecast.projected_utilization || 0}%`],
                      ["High load", forecast.projected_high_load_people || 0],
                    ].map(([name, value]) => <div key={name} className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] p-3"><div className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#8A867F]">{name}</div><div className="mt-1.5 text-[17px] font-semibold text-[#37342F]">{value}</div></div>); })()}
                  </div>
                ) : null}
              </div>
            </div>
          ) : <EmptyState title="No capacity data" detail="Capacity becomes available as accounting staff and work programs are assigned." />}
        </div>
      ) : null}

      {activeView === "cycles" ? (
        <div className="mt-4">
          <div className="mb-3 flex items-end justify-between gap-3"><div><div className="text-[10px] font-semibold text-[#403C37]">Recurring accounting cycles</div><div className="mt-0.5 text-[9px] text-[#918B83]">Create governed internal work only when the next accounting cycle is ready. No client message is sent automatically.</div></div><button type="button" onClick={() => loadRecurring(true)} disabled={recurringLoading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.07] bg-white px-2.5 text-[8px] font-semibold text-[#716B63]"><RefreshCw size={10} className={recurringLoading ? "animate-spin" : ""} /> Refresh</button></div>
          {recurringError ? <div className="mb-3 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800">{recurringError}</div> : null}
          {materializeNotice ? <div className={`mb-3 flex items-start gap-2 rounded-xl border p-3 text-[9px] ${materializeNotice.tone === "error" ? "border-red-700/15 bg-red-50 text-red-800" : "border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>{materializeNotice.tone === "error" ? <AlertTriangle size={12} className="mt-0.5" /> : <CheckCircle2 size={12} className="mt-0.5" />}{materializeNotice.text}</div> : null}
          {recurringLoading && !recurring ? <LoadingRow text="Planning recurring accounting cycles…" /> : recurring ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <SummaryButton label="Planned" value={recurring.summary?.total || 0} detail="90-day candidates" />
                <SummaryButton label="Ready" value={recurring.summary?.ready_to_create || 0} detail="Safe to create" />
                <SummaryButton label="Entity setup" value={recurring.summary?.blocked_entity_configuration || 0} detail="Legal entity missing" attention />
                <SummaryButton label="Period setup" value={recurring.summary?.blocked_period_configuration || 0} detail="Financial period missing" attention />
                <SummaryButton label="Existing" value={recurring.summary?.already_exists || 0} detail="Duplicate protected" />
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                {(recurring.candidates || []).filter((candidate) => candidate.status === "READY_TO_CREATE").map((candidate) => {
                  const creating = materializingKey === candidate.idempotency_key;
                  return (
                    <div key={candidate.idempotency_key} className="rounded-2xl border border-emerald-700/10 bg-white p-4">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#3F3B36]">{candidate.client_name || "Client"}</div><div className="mt-1 text-[9px] text-[#918B83]">{candidate.template_name || label(candidate.service_key || candidate.cadence)} · due {shortDate(candidate.due_at)}</div></div><span className="rounded-full border border-emerald-700/15 bg-emerald-50 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-emerald-800">Ready</span></div>
                      <div className="mt-3 text-[9px] leading-4 text-[#716B63]">Creates the internal work program and draft evidence requests. It does not email or remind the client.</div>
                      <button type="button" onClick={() => materializeRecurringCycle(candidate)} disabled={Boolean(materializingKey)} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#6E8A70]/20 bg-emerald-50/40 px-2.5 text-[8px] font-semibold text-[#58705B] disabled:opacity-50">{creating ? <LoaderCircle size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}{creating ? "Creating…" : "Create cycle"}</button>
                    </div>
                  );
                })}
              </div>

              {(recurring.candidates || []).filter((candidate) => !["READY_TO_CREATE", "ALREADY_EXISTS"].includes(candidate.status)).length ? (
                <div className="rounded-2xl border border-amber-700/10 bg-[#FFF9EF] p-4"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Configuration blockers</div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{(recurring.candidates || []).filter((candidate) => !["READY_TO_CREATE", "ALREADY_EXISTS"].includes(candidate.status)).slice(0, 12).map((candidate) => <div key={candidate.idempotency_key} className="rounded-xl border border-black/[0.06] bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="truncate text-[9px] font-semibold text-[#403C37]">{candidate.client_name || "Client"}</div><span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold uppercase ${statusTone(candidate.status)}`}>{label(candidate.status)}</span></div>{candidate.blockers?.[0] ? <div className="mt-2 text-[8px] leading-4 text-[#7D6A50]">{candidate.blockers[0]}</div> : null}</div>)}</div></div>
              ) : null}
            </div>
          ) : <EmptyState title="No recurring cycle plan" detail="Recurring accounting work appears here when active engagements and templates require a new cycle." />}
        </div>
      ) : null}
    </section>
  );
}
