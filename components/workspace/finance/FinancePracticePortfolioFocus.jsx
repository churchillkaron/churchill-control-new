"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function label(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "No deadline";
}

function financeHref(organizationId, route) {
  if (!organizationId) return "#";
  return `/workspace/${organizationId}${route}`;
}

function stateTone(state) {
  const value = String(state || "").toUpperCase();
  if (value === "ATTENTION") return "border-red-700/15 bg-red-50 text-red-800";
  if (value === "REVIEW") return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (value === "WAITING_SAFELY") return "border-black/[0.08] bg-[#F6F4F0] text-[#746E66]";
  if (value === "CLEAR") return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  return "border-[#A37849]/12 bg-[#FBF8F3] text-[#76583A]";
}

function ownerName(client, role) {
  if (role === "reviewer") return client?.assigned_reviewer || client?.assigned_accountant || "Unassigned";
  if (role === "partner") return client?.assigned_partner || client?.assigned_reviewer || "Unassigned";
  return client?.assigned_accountant || client?.assigned_reviewer || "Unassigned";
}

function nextHumanMove(client) {
  const work = client?.workload || {};
  const blocked = number(work.blocked_work);
  const changes = number(work.changes_requested);
  const review = number(work.ready_for_review);
  const partner = number(work.reviewed_pending_partner);
  const responses = number(work.submitted_client_requests);
  const overdue = number(work.overdue);
  const waiting = number(work.waiting_on_client);
  const activeRuns = number(work.active_runs);
  const open = number(work.open);

  if (blocked > 0) {
    return {
      title: "Resolve blocking work",
      detail: `${blocked} blocked item${blocked === 1 ? "" : "s"} stop the file moving forward.`,
      owner: ownerName(client, "accountant"),
      state: "ATTENTION",
    };
  }
  if (changes > 0) {
    return {
      title: "Resolve requested changes",
      detail: `${changes} returned item${changes === 1 ? "" : "s"} need preparer action.`,
      owner: ownerName(client, "accountant"),
      state: "ATTENTION",
    };
  }
  if (review > 0) {
    return {
      title: "Review prepared work",
      detail: `${review} item${review === 1 ? " is" : "s are"} ready for reviewer judgment.`,
      owner: ownerName(client, "reviewer"),
      state: "REVIEW",
    };
  }
  if (partner > 0) {
    return {
      title: "Complete partner clearance",
      detail: `${partner} item${partner === 1 ? " is" : "s are"} waiting for final partner judgment.`,
      owner: ownerName(client, "partner"),
      state: "REVIEW",
    };
  }
  if (responses > 0) {
    return {
      title: "Inspect client response",
      detail: `${responses} submitted response${responses === 1 ? "" : "s"} can move the work again.`,
      owner: ownerName(client, "accountant"),
      state: "REVIEW",
    };
  }
  if (overdue > 0) {
    return {
      title: "Review overdue exceptions",
      detail: `${overdue} overdue item${overdue === 1 ? "" : "s"}; existing client waits remain governed by request state.`,
      owner: ownerName(client, "accountant"),
      state: "ATTENTION",
    };
  }
  if (waiting > 0) {
    return {
      title: "Wait — request already active",
      detail: `${waiting} client dependenc${waiting === 1 ? "y is" : "ies are"} already in flight; do not chase from this view.`,
      owner: "Client response",
      state: "WAITING_SAFELY",
    };
  }
  if (activeRuns > 0 || open > 0) {
    return {
      title: "Continue preparation",
      detail: `${activeRuns || open} active accounting workstream${(activeRuns || open) === 1 ? "" : "s"}.`,
      owner: ownerName(client, "accountant"),
      state: "IN_PROGRESS",
    };
  }
  return {
    title: "No immediate human action",
    detail: "The active engagement has no surfaced exception requiring intervention.",
    owner: ownerName(client, "accountant"),
    state: "CLEAR",
  };
}

export default function FinancePracticePortfolioFocus({ organizationId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/workspace/finance/practice-control", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      const response = await fetch(url.toString(), {
        cache: "no-store",
        credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || "Unable to load accounting-firm portfolio");
      }
      setData(body);
    } catch (loadError) {
      setError(loadError?.message || "Unable to refresh accounting-firm portfolio");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  const summary = data?.summary || {};
  const clients = useMemo(
    () => (Array.isArray(data?.clients) ? data.clients.slice(0, 8) : []),
    [data?.clients],
  );

  if (!organizationId || (!data && loading) || !data || number(summary.active_clients) === 0) {
    return null;
  }

  return (
    <section
      aria-label="Accounting firm portfolio focus"
      className="mx-auto mb-4 max-w-[1720px] overflow-hidden rounded-[22px] border border-[#A37849]/14 bg-[#FFFDF9] text-[#2A2723]"
    >
      <div className="flex flex-col gap-3 border-b border-black/[0.06] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between md:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
            <UsersRound size={10} /> Firm portfolio
          </div>
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">Exceptions across clients, before dashboards</h2>
          <p className="mt-0.5 max-w-3xl text-[8px] leading-4 text-[#918B83]">
            One ranked view of the client files a person can move now. Review, blockers and decisions stay ahead of passive waiting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[8px] text-[#8B847B]">
          <span><strong className="font-semibold text-[#9A533D]">{number(summary.attention)}</strong> need attention</span>
          <span>·</span>
          <span><strong className="font-semibold text-[#9A533D]">{number(summary.overdue)}</strong> overdue</span>
          <span>·</span>
          <span><strong className="font-semibold text-[#76583A]">{number(summary.ready_for_review)}</strong> ready for review</span>
          <span>·</span>
          <span><strong className="font-semibold text-[#5E5952]">{number(summary.waiting_on_client)}</strong> waiting safely</span>
          <Link
            href={financeHref(organizationId, "/finance/work")}
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 font-semibold text-white"
          >
            Open firm work <ArrowRight size={8} />
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Refresh firm portfolio"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] bg-white text-[#806143] disabled:opacity-50"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(190px,0.9fr)_minmax(310px,1.45fr)_minmax(140px,0.65fr)_110px_120px] gap-4 border-b border-black/[0.05] bg-white/45 px-4 py-2 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#979087] md:grid md:px-5">
        <span>Client</span>
        <span>Next human move</span>
        <span>Owner</span>
        <span>Deadline</span>
        <span>State</span>
      </div>

      <div className="divide-y divide-black/[0.05]">
        {clients.map((client) => {
          const move = nextHumanMove(client);
          return (
            <div
              key={client.organization_id || client.engagement_id}
              className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(190px,0.9fr)_minmax(310px,1.45fr)_minmax(140px,0.65fr)_110px_120px] md:items-center md:gap-4 md:px-5"
            >
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#403C37]">{client.name || "Client organization"}</div>
                <div className="mt-0.5 truncate text-[7px] uppercase tracking-[0.08em] text-[#A09A92]">
                  {client.service_package ? label(client.service_package) : "Active engagement"}
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold text-[#3C3732]">{move.title}</div>
                <div className="mt-0.5 truncate text-[8px] text-[#8D857D]">{move.detail}</div>
              </div>
              <div className="min-w-0 truncate text-[8px] font-semibold text-[#655F58]">{move.owner}</div>
              <div className="flex items-center gap-1.5 text-[8px] text-[#817A72]">
                <Clock3 size={9} className="text-[#A69F97]" /> {shortDate(client.next_deadline)}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${stateTone(move.state)}`}>
                  {label(move.state)}
                </span>
                {move.state === "CLEAR" ? <CheckCircle2 size={10} className="text-emerald-700" /> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 border-t border-black/[0.05] bg-white/55 px-4 py-2 text-[7px] text-[#938C84] sm:flex-row sm:items-center sm:justify-between md:px-5">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={9} className="text-[#66765F]" /> Portfolio is ranked by human actionability; it does not bypass preparation, review or partner controls.
        </span>
        <span>{error ? "Portfolio refresh delayed · last successful state retained" : "Existing client requests remain visible without being auto-chased."}</span>
      </div>
    </section>
  );
}
