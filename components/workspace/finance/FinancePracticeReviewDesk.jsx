"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

const FILTERS = [
  { id: "READY", label: "Ready" },
  { id: "REVIEWER", label: "Reviewer steps" },
  { id: "PARTNER", label: "Partner" },
  { id: "CHANGES", label: "Changes" },
  { id: "ALL", label: "All" },
];

function label(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function tone(value) {
  const status = String(value || "").toUpperCase();
  if (["CHANGES_REQUESTED", "BLOCKED"].includes(status)) return "border-red-700/15 bg-red-50 text-red-800";
  if (["READY_FOR_REVIEW", "REVIEWER", "PARTNER"].includes(status)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["COMPLETE", "CLEARED"].includes(status)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-black/[0.08] bg-[#F7F6F3] text-[#716B63]";
}

function queueStage(row) {
  const status = String(row.status || "").toUpperCase();
  const role = String(row.required_role || "").toUpperCase();
  if (status === "READY_FOR_REVIEW") return "READY";
  if (status === "CHANGES_REQUESTED") return "CHANGES";
  if (role === "PARTNER") return "PARTNER";
  return "REVIEWER";
}

function truthLabel(row) {
  const systemGate = row.metadata?.system_gate;
  if (systemGate?.applicable === true) return systemGate.satisfied === true ? "System verified" : "System blocked";
  if (row.finance_review_item_id) return "Review linked";
  if (row.evidence) return "Evidence recorded";
  return "Review required";
}

export default function FinancePracticeReviewDesk({ rows = [], loading = false, error = "", onRefresh, onOpen }) {
  const [filter, setFilter] = useState("READY");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const stage = queueStage(row);
      if (filter !== "ALL" && stage !== filter) return false;
      if (!needle) return true;
      return [row.client_name, row.title, row.assigned_reviewer, row.assigned_accountant, row.conclusion]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, filter, search]);

  const readyCount = rows.filter((row) => queueStage(row) === "READY").length;
  const reviewerCount = rows.filter((row) => queueStage(row) === "REVIEWER").length;
  const partnerCount = rows.filter((row) => queueStage(row) === "PARTNER").length;
  const changesCount = rows.filter((row) => queueStage(row) === "CHANGES").length;
  const overdueCount = rows.filter((row) => row.due_at && shortDate(row.due_at) < new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ["Ready", readyCount, "Prepared work to inspect"],
          ["Reviewer steps", reviewerCount, "Review procedures now active"],
          ["Partner", partnerCount, "Final clearance work"],
          ["Changes", changesCount, "Returned or unresolved"],
          ["Overdue", overdueCount, "Review work past due"],
        ].map(([name, value, detail]) => (
          <div key={name} className="rounded-xl border border-black/[0.07] bg-white px-3.5 py-3">
            <div className="text-[8px] font-medium uppercase tracking-[0.13em] text-[#8C877F]">{name}</div>
            <div className={`mt-1.5 text-[20px] font-semibold tracking-[-0.03em] ${Number(value) > 0 && ["Changes", "Overdue"].includes(name) ? "text-[#9A533D]" : "text-[#2A2723]"}`}>{value}</div>
            <div className="mt-0.5 text-[8px] text-[#99938A]">{detail}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${filter === item.id ? "border-[#A37849]/25 bg-[#A37849]/[0.08] text-[#76583A]" : "border-black/[0.07] bg-white text-[#817D76]"}`}>{item.label}</button>
          ))}
        </div>
        <div className="flex w-full gap-2 xl:w-auto">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 xl:w-[300px]"><Search size={12} className="text-[#A29D95]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, procedure or reviewer" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#403C37] outline-none placeholder:text-[#B2ADA5]" /></label>
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-black/[0.07] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-45"><RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 p-3 text-[9px] text-red-800"><div className="flex items-start gap-2"><AlertTriangle size={11} className="mt-0.5" /><span>{error}</span></div></div> : null}

      {loading && !rows.length ? (
        <div className="flex min-h-[180px] items-center justify-center text-[10px] text-[#817D76]"><RefreshCw size={12} className="mr-2 animate-spin text-[#A37849]" /> Preparing reviewer queue…</div>
      ) : filtered.length ? (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.07] bg-white">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[100px_minmax(180px,1.1fr)_minmax(250px,1.45fr)_130px_120px_minmax(180px,1fr)_95px] gap-3 border-b border-black/[0.06] bg-[#FAF9F7] px-4 py-2.5 text-[8px] font-medium uppercase tracking-[0.11em] text-[#8A867F]"><span>Due</span><span>Client</span><span>Procedure</span><span>Stage</span><span>Truth</span><span>Conclusion</span><span>Review</span></div>
            {filtered.slice(0, 300).map((row) => {
              const stage = queueStage(row);
              const overdue = row.due_at && shortDate(row.due_at) < new Date().toISOString().slice(0, 10);
              return (
                <button key={row.id} type="button" onClick={() => onOpen?.(row)} className="group grid w-full grid-cols-[100px_minmax(180px,1.1fr)_minmax(250px,1.45fr)_130px_120px_minmax(180px,1fr)_95px] items-center gap-3 border-b border-black/[0.05] px-4 py-3 text-left text-[9px] last:border-0 hover:bg-[#FCFAF6]">
                  <div className={`flex items-center gap-1.5 tabular-nums ${overdue ? "font-semibold text-[#9A533D]" : "text-[#5E5952]"}`}><CalendarClock size={9} /> {shortDate(row.due_at)}</div>
                  <div className="min-w-0"><div className="truncate font-semibold text-[#403C37] group-hover:text-[#76583A]">{row.client_name}</div><div className="mt-0.5 truncate text-[8px] text-[#99938A]">{row.assigned_reviewer || "Reviewer unassigned"}</div></div>
                  <div className="min-w-0"><div className="truncate font-medium text-[#37342F]">{row.title}</div><div className="mt-0.5 truncate text-[8px] text-[#99938A]">Prepared by {row.assigned_accountant || "unassigned"}</div></div>
                  <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${tone(stage)}`}>{stage === "PARTNER" ? <ShieldCheck size={8} /> : stage === "CHANGES" ? <AlertTriangle size={8} /> : <FileCheck2 size={8} />}{label(stage)}</span></div>
                  <div className="text-[8px] font-medium text-[#716B63]">{truthLabel(row)}</div>
                  <div className="min-w-0 truncate text-[8px] leading-4 text-[#716B63]">{row.conclusion || "Open workpaper to inspect evidence and conclusion"}</div>
                  <div className="flex items-center justify-end gap-1 font-semibold text-[#76583A]"><span>{stage === "CHANGES" ? "Open" : "Review"}</span><ChevronRight size={10} /></div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-black/[0.07] bg-white px-5 py-9 text-center">
          <CheckCircle2 size={19} className="mx-auto text-[#6F7E68]" />
          <div className="mt-2 text-[11px] font-semibold text-[#3D3934]">No review work in this view</div>
          <div className="mx-auto mt-1 max-w-xl text-[9px] leading-5 text-[#8B867E]">Prepared procedures, reviewer steps and partner clearance appear here from the governed accounting work programs.</div>
        </div>
      )}

      <div className="rounded-xl border border-black/[0.06] bg-[#FAF9F7] px-3 py-2.5 text-[8px] leading-4 text-[#817D76]">
        <div className="flex items-start gap-2"><UserRoundCheck size={10} className="mt-0.5 shrink-0 text-[#9A744B]" /><span>The reviewer queue does not create a parallel review record. It opens the exact client workpaper and uses the existing evidence, lifecycle, Finance review and audit controls.</span></div>
      </div>
    </div>
  );
}
