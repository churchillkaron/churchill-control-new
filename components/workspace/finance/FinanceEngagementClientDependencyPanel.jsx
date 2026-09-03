"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
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

function canIssueAccess(analysis, request) {
  if (!request?.id) return false;
  return ["NOT_ISSUED", "ACCESS_EXPIRED"].includes(String(analysis?.state || "").toUpperCase());
}

export default function FinanceEngagementClientDependencyPanel({ organizationId, run, onReload }) {
  const [actionState, setActionState] = useState({});
  if (!run) return null;

  async function issueAccess(request, analysis) {
    if (!organizationId || !canIssueAccess(analysis, request)) return;
    const requestId = request.id;
    setActionState((current) => ({
      ...current,
      [requestId]: { loading: true, error: "", clientPath: current[requestId]?.clientPath || "", expiresAt: current[requestId]?.expiresAt || null, copied: false },
    }));

    try {
      const response = await fetch("/api/workspace/finance/client-request-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, clientRequestId: requestId, action: "issue" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to issue secure client access");
      setActionState((current) => ({
        ...current,
        [requestId]: {
          loading: false,
          error: "",
          clientPath: body.client_path || "",
          expiresAt: body.expires_at || null,
          copied: false,
        },
      }));
      if (onReload) await onReload();
    } catch (error) {
      setActionState((current) => ({
        ...current,
        [requestId]: { loading: false, error: error?.message || "Unable to issue secure client access", clientPath: "", expiresAt: null, copied: false },
      }));
    }
  }

  async function copySecureLink(requestId, clientPath) {
    if (!clientPath || typeof window === "undefined") return;
    const absoluteUrl = new URL(clientPath, window.location.origin).toString();
    await navigator.clipboard.writeText(absoluteUrl);
    setActionState((current) => ({
      ...current,
      [requestId]: { ...(current[requestId] || {}), copied: true },
    }));
  }

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
          const action = request?.id ? actionState[request.id] || {} : {};
          const accessAction = canIssueAccess(analysis, request);
          return (
            <div key={item.id} className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(180px,0.9fr)_minmax(260px,1.4fr)_minmax(250px,1.2fr)] md:items-start">
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
                {accessAction ? <button type="button" onClick={() => issueAccess(request, analysis)} disabled={action.loading} className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#2A2723] px-2.5 text-[8px] font-semibold text-white disabled:opacity-50">{action.loading ? <LoaderCircle size={9} className="animate-spin" /> : <ShieldCheck size={9} />}{analysis.state === "ACCESS_EXPIRED" ? "Restore secure access" : "Issue secure access"}</button> : null}
                {action.error ? <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-2 py-1.5 text-[8px] text-red-800">{action.error}</div> : null}
                {action.clientPath ? <div className="mt-2 rounded-lg border border-emerald-700/10 bg-emerald-50 px-2.5 py-2">
                  <div className="text-[8px] font-semibold text-emerald-900">Secure access issued</div>
                  <div className="mt-0.5 text-[7px] leading-3 text-emerald-800/80">This link is returned once. Copy or open it now; Avantiqo has not sent it to the client. Expires {date(action.expiresAt)}.</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => copySecureLink(request.id, action.clientPath)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-800/15 bg-white px-2 text-[8px] font-semibold text-emerald-900">{action.copied ? <Check size={9} /> : <Copy size={9} />}{action.copied ? "Copied" : "Copy link"}</button>
                    <a href={action.clientPath} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-800/15 bg-white px-2 text-[8px] font-semibold text-emerald-900"><ExternalLink size={9} /> Open link</a>
                  </div>
                </div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[8px] text-[#918B83]">Decision support and governed access only. Client communication, evidence acceptance, review and sign-off remain separate governed actions; this panel never sends a client message automatically.</div>
    </section>
  );
}