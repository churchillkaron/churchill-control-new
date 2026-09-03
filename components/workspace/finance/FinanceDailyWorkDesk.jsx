"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FolderOpen,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  UserRoundCheck,
  Users,
} from "lucide-react";

import FinanceEngagementFile from "@/components/workspace/finance/FinanceEngagementFile";
import FinancePracticeControlTower from "@/components/workspace/finance/FinancePracticeControlTower";

const VIEW_DEFS = [
  { id: "mine", label: "My work" },
  { id: "today", label: "Due today" },
  { id: "overdue", label: "Overdue" },
  { id: "changes", label: "Changes requested" },
  { id: "waiting", label: "Waiting on client" },
  { id: "review", label: "Ready for review" },
  { id: "all", label: "All work" },
];

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKey(value) {
  return value ? String(value).slice(0, 10) : null;
}

function shortDate(value) {
  const key = dateKey(value);
  return key || "No due date";
}

function statusTone(status) {
  const value = String(status || "").toUpperCase();
  if (["BLOCKED", "CHANGES_REQUESTED"].includes(value)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "IN_PROGRESS", "READY"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (value === "WAITING_ON_CLIENT") return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function priorityRank(item, today) {
  const status = String(item.status || "").toUpperCase();
  const due = dateKey(item.due_at);
  if (status === "CHANGES_REQUESTED") return 0;
  if (status === "BLOCKED") return 1;
  if (due && due < today) return 2;
  if (due === today) return 3;
  if (status === "IN_PROGRESS") return 4;
  if (status === "READY") return 5;
  if (status === "READY_FOR_REVIEW") return 6;
  if (status === "WAITING_ON_CLIENT") return 8;
  return 7;
}

function nextActionText(item, today) {
  if (!item) return { title: "Your queue is clear", detail: "There is no assigned accounting work requiring action right now." };
  const status = String(item.status || "").toUpperCase();
  const due = dateKey(item.due_at);
  if (status === "CHANGES_REQUESTED") return { title: `Resume ${item.title}`, detail: `${item.client_name} requested changes are the highest-priority handback in your queue.` };
  if (status === "BLOCKED") return { title: `Unblock ${item.title}`, detail: item.blocked_reason || `${item.client_name} cannot progress until this dependency is resolved.` };
  if (due && due < today) return { title: `Finish ${item.title}`, detail: `${item.client_name} is overdue since ${due}.` };
  if (due === today) return { title: `Do ${item.title} next`, detail: `${item.client_name} is due today.` };
  if (status === "IN_PROGRESS") return { title: `Continue ${item.title}`, detail: `${item.client_name} is already in progress, so finishing it avoids unnecessary context switching.` };
  return { title: `Start ${item.title}`, detail: `${item.client_name} is the next assigned procedure by due date and accounting priority.` };
}

function filterRows(rows, view, viewerId, today) {
  return rows.filter((item) => {
    const status = String(item.status || "").toUpperCase();
    const due = dateKey(item.due_at);
    if (view === "mine") return viewerId ? item.assigned_to === viewerId : true;
    if (view === "today") return due === today && status !== "WAITING_ON_CLIENT";
    if (view === "overdue") return Boolean(due && due < today && status !== "WAITING_ON_CLIENT");
    if (view === "changes") return status === "CHANGES_REQUESTED";
    if (view === "waiting") return status === "WAITING_ON_CLIENT";
    if (view === "review") return status === "READY_FOR_REVIEW";
    return true;
  });
}

function LoadingState() {
  return <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#807A72]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />Preparing your accounting work…</div>;
}

export default function FinanceDailyWorkDesk({ organizationId }) {
  const [practice, setPractice] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("mine");
  const [query, setQuery] = useState("");
  const [selectedEngagementId, setSelectedEngagementId] = useState(null);
  const [showPracticeManagement, setShowPracticeManagement] = useState(false);
  const today = localDateKey();

  async function load() {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const [practiceResponse, programsResponse] = await Promise.all([
        fetch(`/api/workspace/finance/practice-control?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" }),
        fetch(`/api/workspace/finance/work-programs?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", credentials: "include" }),
      ]);
      const [practiceBody, programsBody] = await Promise.all([
        practiceResponse.json().catch(() => ({})),
        programsResponse.json().catch(() => ({})),
      ]);
      if (!practiceResponse.ok || practiceBody?.success === false) throw new Error(practiceBody?.error || "Unable to load accounting practice");
      if (!programsResponse.ok || programsBody?.success === false) throw new Error(programsBody?.error || "Unable to load accounting work");
      setPractice(practiceBody);
      setPrograms(programsBody);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load accounting work");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const clients = Array.isArray(practice?.clients) ? practice.clients : [];
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.organization_id, client])), [clients]);
  const viewer = practice?.viewer || {};
  const viewerId = viewer.staff_account_id || null;

  const workRows = useMemo(() => {
    const rows = [];
    for (const run of programs?.runs || []) {
      const client = clientMap.get(run.organization_id);
      for (const item of run.work_items || []) {
        const status = String(item.status || "").toUpperCase();
        if (["COMPLETE", "SKIPPED"].includes(status)) continue;
        rows.push({
          ...item,
          engagement_id: run.engagement_id,
          organization_id: run.organization_id,
          client_name: client?.name || "Client organization",
          assigned_accountant: client?.assigned_accountant || null,
          assigned_reviewer: client?.assigned_reviewer || null,
        });
      }
    }
    return rows.sort((a, b) => priorityRank(a, today) - priorityRank(b, today) || String(a.due_at || "9999-12-31").localeCompare(String(b.due_at || "9999-12-31")) || Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
  }, [programs, clientMap, today]);

  const counts = useMemo(() => Object.fromEntries(VIEW_DEFS.map((view) => [view.id, filterRows(workRows, view.id, viewerId, today).length])), [workRows, viewerId, today]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return filterRows(workRows, activeView, viewerId, today).filter((item) => {
      if (!needle) return true;
      return [item.client_name, item.title, item.description, item.required_role, item.status, item.assigned_accountant, item.assigned_reviewer]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [workRows, activeView, viewerId, today, query]);

  const myPriorityRows = useMemo(() => filterRows(workRows, "mine", viewerId, today).filter((item) => String(item.status || "").toUpperCase() !== "WAITING_ON_CLIENT"), [workRows, viewerId, today]);
  const nextItem = myPriorityRows[0] || null;
  const nextAction = nextActionText(nextItem, today);

  if (selectedEngagementId) {
    return (
      <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-black/[0.06] pb-3">
          <button type="button" onClick={() => setSelectedEngagementId(null)} className="text-[9px] font-semibold text-[#76583A] hover:text-[#4E3822]">← Back to my work</button>
          <div className="text-[8px] text-[#99938A]">Client file · work · evidence · review</div>
        </div>
        <FinanceEngagementFile organizationId={organizationId} engagementId={selectedEngagementId} onClose={() => setSelectedEngagementId(null)} />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#8A633C]"><UserRoundCheck size={11} /> Daily accounting work</div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#2A2723]">{viewerId ? `${viewer.name || "Your"} work` : "Priority work"}</h1>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#756F67]">Avantiqo ranks the work that can move now. Changes, blockers and overdue work come first; waiting items stay visible without crowding the actionable queue.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowPracticeManagement((value) => !value)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#706A63]"><Users size={10} /> {showPracticeManagement ? "Hide practice management" : "Practice management"}</button>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#A37849]/20 bg-white px-3 text-[8px] font-semibold text-[#76583A] disabled:opacity-50"><RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh</button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800"><div className="flex items-start gap-2"><AlertTriangle size={11} className="mt-0.5" />{error}</div></div> : null}
        {loading && !programs ? <div className="mt-4"><LoadingState /></div> : null}

        {!loading && programs ? (
          <>
            <div className="mt-4 rounded-2xl border border-[#A37849]/15 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`mt-0.5 rounded-xl p-2 ${nextItem ? "bg-[#A37849]/[0.09] text-[#8A633C]" : "bg-emerald-50 text-emerald-700"}`}>{nextItem ? <Sparkles size={14} /> : <CheckCircle2 size={14} />}</div>
                  <div className="min-w-0">
                    <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#9A948B]">Recommended next</div>
                    <div className="mt-1 truncate text-[12px] font-semibold text-[#39352F]">{nextAction.title}</div>
                    <div className="mt-0.5 text-[9px] leading-4 text-[#817A72]">{nextAction.detail}</div>
                  </div>
                </div>
                {nextItem ? <button type="button" onClick={() => setSelectedEngagementId(nextItem.engagement_id)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white">Open workpaper <ArrowRight size={9} /></button> : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {VIEW_DEFS.filter((view) => view.id !== "all").map((view) => {
                const active = activeView === view.id;
                const attention = ["overdue", "changes"].includes(view.id) && counts[view.id] > 0;
                return <button key={view.id} type="button" onClick={() => setActiveView(view.id)} className={`rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[#A37849]/35 bg-[#A37849]/[0.08]" : "border-black/[0.07] bg-white hover:border-[#A37849]/25"}`}><div className="text-[8px] font-medium text-[#817B73]">{view.label}</div><div className={`mt-1 text-[18px] font-semibold tabular-nums ${attention ? "text-[#9A533D]" : "text-[#342F2A]"}`}>{counts[view.id] || 0}</div></button>;
              })}
            </div>

            <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-1 overflow-x-auto">
                {VIEW_DEFS.map((view) => <button key={view.id} type="button" onClick={() => setActiveView(view.id)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[8px] font-semibold ${activeView === view.id ? "border-[#A37849]/25 bg-[#A37849]/[0.08] text-[#76583A]" : "border-black/[0.07] bg-white text-[#817D76]"}`}>{view.label} <span className="ml-1 tabular-nums opacity-70">{counts[view.id] || 0}</span></button>)}
              </div>
              <label className="flex h-9 w-full items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 xl:w-[310px]"><Search size={11} className="text-[#A29D95]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client or procedure" className="min-w-0 flex-1 bg-transparent text-[9px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
              <div className="hidden grid-cols-[82px_minmax(160px,0.9fr)_minmax(250px,1.5fr)_105px_120px_70px] gap-3 border-b border-black/[0.06] px-4 py-2.5 text-[7px] font-medium uppercase tracking-[0.12em] text-[#8A867F] md:grid"><span>Due</span><span>Client</span><span>Procedure</span><span>Role</span><span>Status</span><span></span></div>
              {visibleRows.slice(0, 250).map((item) => {
                const due = dateKey(item.due_at);
                const overdue = Boolean(due && due < today && String(item.status || "").toUpperCase() !== "WAITING_ON_CLIENT");
                return (
                  <button key={item.id} type="button" onClick={() => setSelectedEngagementId(item.engagement_id)} className="group grid w-full gap-2 border-b border-black/[0.05] px-4 py-3 text-left last:border-0 hover:bg-[#FCFAF6] md:grid-cols-[82px_minmax(160px,0.9fr)_minmax(250px,1.5fr)_105px_120px_70px] md:items-center md:gap-3">
                    <div className={`flex items-center gap-1.5 text-[9px] tabular-nums ${overdue ? "font-semibold text-[#9A533D]" : "text-[#686159]"}`}><CalendarClock size={9} />{shortDate(item.due_at)}</div>
                    <div className="truncate text-[9px] font-semibold text-[#48423C]">{item.client_name}</div>
                    <div className="min-w-0"><div className="truncate text-[10px] font-semibold text-[#37322D] group-hover:text-[#76583A]">{item.title}</div><div className="mt-0.5 truncate text-[8px] text-[#99928A]">{item.blocked_reason || item.description || (item.assigned_to === viewerId ? "Assigned to you" : item.assigned_accountant || "Unassigned")}</div></div>
                    <div className="text-[8px] text-[#716A63]">{label(item.required_role)}</div>
                    <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${statusTone(item.status)}`}>{String(item.status || "").toUpperCase() === "WAITING_ON_CLIENT" ? <Clock3 size={8} /> : <CircleDot size={8} />}{label(item.status)}</span></div>
                    <div className="flex justify-end"><span className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#8A633C]"><FolderOpen size={9} /> Open</span></div>
                  </button>
                );
              })}
              {!visibleRows.length ? <div className="px-4 py-10 text-center"><Inbox size={17} className="mx-auto text-[#A7A097]" /><div className="mt-2 text-[10px] font-semibold text-[#4A443E]">Nothing in this view</div><div className="mt-1 text-[8px] text-[#928B83]">Your accounting queue is clear for this filter.</div></div> : null}
            </div>
          </>
        ) : null}
      </section>

      {showPracticeManagement ? (
        <div className="border-t border-black/[0.05] pt-1">
          <FinancePracticeControlTower organizationId={organizationId} />
        </div>
      ) : null}
    </div>
  );
}
