"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function clean(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function periodLabel(period) {
  if (!period) return "Select a period";
  return period.period_name || period.name || period.label ||
    (period.start_date && period.end_date
      ? `${period.start_date} – ${period.end_date}`
      : "Accounting period");
}

function money(value, currencyCode) {
  const number = Number(value || 0);
  try {
    return currencyCode
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode,
          maximumFractionDigits: 2,
        }).format(number)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number);
  } catch {
    return `${currencyCode || ""} ${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(number)}`.trim();
  }
}

function actionForKind(kind, status) {
  const normalized = clean(status).toUpperCase();
  if (kind === "review" && normalized === "CHANGES_REQUESTED") return "Resolve review points";
  if (kind === "review") return "Open review work";
  if (kind === "reconciliation") return "Resolve bank difference";
  if (kind === "approval") return "Make the approval decision";
  if (kind === "filing") return "Prepare the filing";
  if (kind === "close") return "Complete the close step";
  return "Open work";
}

function statusTone(priority) {
  return priority === "attention"
    ? "border-red-700/15 bg-red-50 text-red-800"
    : "border-amber-700/15 bg-amber-50 text-amber-800";
}

function ControlRow({ label, value, detail, href, attention = false }) {
  const content = (
    <>
      <div className="min-w-0">
        <div className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8D877F]">{label}</div>
        <div className="mt-0.5 truncate text-[8px] text-[#9A948B]">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className={`text-right text-[11px] font-semibold tabular-nums ${attention ? "text-[#9A533D]" : "text-[#37332F]"}`}>{value}</div>
        {href ? <ChevronRight size={10} className="text-[#B4AEA6]" /> : null}
      </div>
    </>
  );

  return href ? (
    <Link href={href} className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-[#FCFAF6]">
      {content}
    </Link>
  ) : (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">{content}</div>
  );
}

export default function FinanceAccountantOverview({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    "Select legal entity";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  async function load() {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/workspace/finance/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      if (periodId) url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Finance workspace failed (${response.status})`);
      }
      setData(body);
    } catch (loadError) {
      setData(null);
      setError(loadError?.message || "Finance workspace could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const close = data?.close || { steps: [], completed: 0, total: 0, progress: 0 };
  const practice = data?.practice || { active_clients: 0 };
  const sources = data?.sources || {};
  const currency =
    data?.context?.currency ||
    businessContext.entity?.currency ||
    businessContext.organization?.default_currency ||
    null;

  const recommendation = queue[0] || null;
  const sourceHealth = useMemo(() => {
    const rows = Object.values(sources || {});
    return {
      total: rows.length,
      connected: rows.filter((row) => row?.status === "connected").length,
      errors: rows.filter((row) => row?.status === "error").length,
    };
  }, [sources]);

  const openCloseSteps = (close.steps || []).filter((step) => !step.complete).length;

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 text-[#2A2723]">
      <section className="rounded-[22px] border border-black/[0.07] bg-[#FBF8F3] px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]">
              <span>Accountant workspace</span>
              {practice.active_clients > 0 ? (
                <span className="rounded-full border border-[#A37849]/18 bg-white px-2 py-1 tracking-[0.07em] text-[#76583A]">
                  {practice.active_clients} active clients
                </span>
              ) : null}
            </div>
            <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em]">What needs attention now</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[8px] text-[#817B73]">
              <span className="font-semibold text-[#5F5952]">{entityName}</span>
              <span>·</span>
              <span>{periodLabel(businessContext.period)}</span>
              {data?.context?.period_status ? <><span>·</span><span>{titleCase(data.context.period_status)}</span></> : null}
              {data?.generated_at ? <><span>·</span><span>Updated {new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></> : null}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <Link href={financeHref(organizationId, "/finance/work")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white">
              My work <ArrowRight size={9} />
            </Link>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] disabled:opacity-50">
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {!entityId || !periodId ? (
        <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[10px] text-amber-900">
          Select a legal entity and accounting period in the top bar to load accounting work, balances and close status.
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-4 text-[9px] text-red-800">
          <div className="flex items-start gap-2"><AlertTriangle size={12} className="mt-0.5" /><div><div className="font-semibold">Finance could not load</div><div className="mt-1">{error}</div></div></div>
        </section>
      ) : loading && !data ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#817D76]">
          <LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" /> Preparing accounting work…
        </div>
      ) : data ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.45fr)]">
          <section className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white">
            <div className="border-b border-black/[0.06] px-4 py-3.5 md:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A867F]">Priority work</div>
                  <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">Work ranked by what a person can move</h2>
                  <p className="mt-0.5 text-[8px] text-[#918B83]">Changes, overdue controls and decisions stay ahead of passive waiting.</p>
                </div>
                <Link href={financeHref(organizationId, "/finance/work")} className="text-[8px] font-semibold text-[#76583A]">Open full work list →</Link>
              </div>

              <div className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${recommendation ? "border-[#A37849]/15 bg-[#FBF8F3]" : "border-emerald-700/10 bg-emerald-50/50"}`}>
                <div className="min-w-0">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#918A82]">Recommended next human action</div>
                  <div className="mt-0.5 truncate text-[10px] font-semibold text-[#3E3934]">{recommendation ? recommendation.title : "No surfaced exception needs intervention"}</div>
                  <div className="mt-0.5 text-[8px] text-[#817A72]">{recommendation ? recommendation.detail || titleCase(recommendation.kind) : "Continue normal accounting work or review the selected period."}</div>
                </div>
                {recommendation ? (
                  <Link href={financeHref(organizationId, recommendation.href)} className="inline-flex shrink-0 items-center gap-1 text-[8px] font-semibold text-[#76583A]">
                    {actionForKind(recommendation.kind, recommendation.status)} <ArrowRight size={8} />
                  </Link>
                ) : <CheckCircle2 size={12} className="shrink-0 text-emerald-700" />}
              </div>
            </div>

            <div className="hidden grid-cols-[minmax(240px,1.45fr)_minmax(220px,1fr)_120px_70px] gap-3 border-b border-black/[0.05] bg-[#FCFBF8] px-4 py-2 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#969087] md:grid md:px-5">
              <span>Work</span><span>Why now</span><span>Status</span><span></span>
            </div>

            {queue.slice(0, 12).map((item) => (
              <Link key={item.id} href={financeHref(organizationId, item.href)} className="group grid gap-2 border-b border-black/[0.05] px-4 py-3 last:border-0 hover:bg-[#FCFAF6] md:grid-cols-[minmax(240px,1.45fr)_minmax(220px,1fr)_120px_70px] md:items-center md:gap-3 md:px-5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.priority === "attention" ? "bg-[#A9543F]" : "bg-[#A37849]"}`} />
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-semibold text-[#403C37]">{item.title}</div>
                    <div className="mt-0.5 text-[7px] uppercase tracking-[0.08em] text-[#A09A92]">{titleCase(item.kind)}</div>
                  </div>
                </div>
                <div className="min-w-0 truncate text-[8px] text-[#807A72]">{item.detail || "Accounting control requires attention"}</div>
                <div><span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${statusTone(item.priority)}`}>{titleCase(item.status || item.priority)}</span></div>
                <div className="flex justify-end"><span className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#76583A]">Open <ArrowRight size={8} /></span></div>
              </Link>
            ))}

            {!queue.length ? (
              <div className="flex items-center gap-2 px-5 py-8 text-[9px] text-[#65715F]"><BadgeCheck size={13} /> Nothing currently requires intervention.</div>
            ) : null}
          </section>

          <aside className="h-fit overflow-hidden rounded-[22px] border border-black/[0.07] bg-white">
            <div className="border-b border-black/[0.06] px-4 py-3.5">
              <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A867F]">Control state</div>
              <h2 className="mt-1 text-[14px] font-semibold tracking-[-0.02em]">Accounting context, not a dashboard</h2>
              <p className="mt-0.5 text-[8px] leading-4 text-[#918B83]">Only numbers that help decide where to work next.</p>
            </div>
            <div className="divide-y divide-black/[0.055]">
              <ControlRow label="Receivables" value={money(metrics.receivables?.amount, currency)} detail={`${metrics.receivables?.count || 0} open · ${metrics.receivables?.overdue || 0} overdue`} attention={(metrics.receivables?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/ar")} />
              <ControlRow label="Payables" value={money(metrics.payables?.amount, currency)} detail={`${metrics.payables?.count || 0} open · ${metrics.payables?.overdue || 0} overdue`} attention={(metrics.payables?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/ap")} />
              <ControlRow label="Review" value={String(metrics.review?.count || 0)} detail={`${metrics.review?.ready || 0} ready · ${metrics.review?.changes_requested || 0} changes · ${metrics.review?.overdue || 0} overdue`} attention={(metrics.review?.ready || 0) > 0 || (metrics.review?.changes_requested || 0) > 0} href={financeHref(organizationId, "/finance/review")} />
              <ControlRow label="Bank reconciliation" value={String(metrics.reconciliation?.count || 0)} detail={`${money(metrics.reconciliation?.difference, currency)} unresolved difference`} attention={(metrics.reconciliation?.count || 0) > 0} href={financeHref(organizationId, "/finance/bank-reconciliation")} />
              <ControlRow label="Statutory filings" value={String(metrics.filings?.count || 0)} detail={`${metrics.filings?.overdue || 0} overdue`} attention={(metrics.filings?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/statutory-filings")} />
              <ControlRow label="Period close" value={`${close.completed || 0}/${close.total || 0}`} detail={`${openCloseSteps} open · ${close.progress || 0}% complete`} attention={openCloseSteps > 0} href={financeHref(organizationId, "/finance/close")} />
            </div>
            <div className="border-t border-black/[0.05] bg-[#FCFBF8] px-4 py-3 text-[7px] text-[#8E887F]">
              <div className="flex items-center gap-1.5"><ShieldCheck size={9} className={sourceHealth.errors ? "text-[#9A533D]" : "text-[#66765F]"} /><span className="font-semibold">{sourceHealth.connected}/{sourceHealth.total || sourceHealth.connected} control sources connected</span>{sourceHealth.errors ? <span>· {sourceHealth.errors} warning{sourceHealth.errors === 1 ? "" : "s"}</span> : null}</div>
              <div className="mt-1">No recommendation bypasses approval, review, partner clearance or period-close controls.</div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
