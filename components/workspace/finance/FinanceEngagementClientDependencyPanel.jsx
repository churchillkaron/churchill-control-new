"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

import { resolveFinanceClientDependency } from "@/lib/finance/ui/FinanceClientDependencyPolicy";

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function date(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function tone(state) {
  const value = String(state || "").toUpperCase();
  if (["CLIENT_RESPONDED", "ACCEPTED"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["ACCESS_EXPIRED", "FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP", "NOT_ISSUED", "REQUEST_MISSING"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
}

function iconFor(state) {
  const value = String(state || "").toUpperCase();
  if (value === "CLIENT_RESPONDED") return FileCheck2;
  if (value === "ACCEPTED") return CheckCircle2;
  if (value === "ACCESS_EXPIRED") return ShieldCheck;
  if (["FOLLOW_UP_DUE", "MANUAL_FOLLOW_UP", "NOT_ISSUED", "REQUEST_MISSING"].includes(value)) return AlertTriangle;
  return Clock3;
}

export default function FinanceEngagementClientDependencyPanel({ run }) {
  if (!run) return null;

  const requests = new Map((run.client_requests || []).map((request) => [request.work_item_id, request]));
  const rows = (run.work_items || [])
    .filter((item) => String(item.status || "").toUpperCase() === "WAITING_ON_CLIENT" || item.work_type === "CLIENT_REQUEST")
    .map((item) => {
      const request = requests.get(item.id) || null;
      return {
        item,
        request,
        analysis: resolveFinanceClientDependency(request, { workItem: item }),
      };
    })
    .sort((left, right) => Number(left.analysis.priority ?? 99) - Number(right.analysis.priority ?? 99));

  if (!rows.length) return null;

  const actionRows = rows.filter((row) => !row.analysis.shouldWait && row.analysis.state !== "ACCEPTED");
  const quietRows = rows.filter((row) => row.analysis.shouldWait);
  const respondedRows = rows.filter((row) => row.analysis.state === "CLIENT_RESPONDED");
  const accessRows = rows.filter((row) => row.analysis.state === "ACCESS_EXPIRED");

  return (
    <section className="rounded-2xl border border-[#A37849]/14 bg-[#FFFDF9] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8A633C]"><UserRoundCheck size={10} /> Client dependency intelligence</div>
          <div className="mt-1 text-[13px] font-semibold text-[#37322D]">What is missing, what changed, and what to do next</div>
          <div className="mt-1 text-[8px] leading-4 text-[#817A72]">This view interprets the governed client request beside the accounting work it blocks. A client response becomes evidence review, expired access must be restored before any chase, and recent contact stays quiet.</div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2"><div className="text-[16px] font-semibold tabular-nums text-[#36312C]">{actionRows.length}</div><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Needs action</div></div>
          <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2"><div className="text-[16px] font-semibold tabular-nums text-[#36312C]">{respondedRows.length}</div><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Responded</div></div>
          <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2"><div className="text-[16px] font-semibold tabular-nums text-[#36312C]">{accessRows.length}</div><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Access issue</div></div>
          <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2"><div className="text-[16px] font-semibold tabular-nums text-[#36312C]">{quietRows.length}</div><div className="text-[7px] uppercase tracking-[0.08em] text-[#99928A]">Do not chase</div></div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-black/[0.05] overflow-hidden rounded-xl border border-black/[0.06] bg-white">
        {rows.slice(0, 8).map(({ item, request, analysis }) => {
          const Icon = iconFor(analysis.state);
          return (
            <div key={item.id} className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(180px,0.9fr)_minmax(260px,1.4fr)_minmax(220px,1.1fr)] md:items-center">
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#403C37]">{item.title || request?.title || "Client evidence request"}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-[#99928A]"><span>Due {date(request?.due_at || item.due_at)}</span>{request?.sent_at ? <span>Sent {date(request.sent_at)}</span> : null}{request?.submitted_at ? <span>Submitted {date(request.submitted_at)}</span> : null}</div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${tone(analysis.state)}`}><Icon size={8} /> {label(analysis.state)}</span></div>
                <div className="mt-1 text-[9px] font-semibold text-[#49423B]">{analysis.title}</div>
                <div className="mt-0.5 text-[8px] leading-4 text-[#8D857D]">{analysis.detail}</div>
              </div>
              <div className="min-w-0 rounded-lg bg-[#F8F6F2] px-3 py-2">
                <div className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#99928A]">Next safe action</div>
                <div className="mt-1 text-[9px] font-semibold text-[#6E4D2D]">{analysis.nextAction}</div>
                {analysis.blocks ? <div className="mt-1 text-[8px] leading-4 text-[#918B83]">{analysis.blocks}</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[8px] text-[#918B83]">Decision support only. Client communication, secure-access issuance, evidence acceptance, review and sign-off remain governed actions; this panel sends nothing automatically.</div>
    </section>
  );
}
