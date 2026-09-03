"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Landmark,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function money(value, currencyCode) {
  const number = Number(value || 0);
  try {
    return currencyCode
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(number)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number);
  } catch {
    return `${currencyCode || ""} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)}`.trim();
  }
}

function periodLabel(period) {
  if (!period) return "Select a period";
  return period.period_name || period.name || period.label ||
    (period.start_date && period.end_date ? `${period.start_date} – ${period.end_date}` : "Accounting period");
}

function MetricCard({ label, value, detail, icon: Icon, warning = false, href }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#817D76]">{label}</div>
        <Icon size={14} className={warning ? "text-[#9A533D]" : "text-[#A37849]"} />
      </div>
      <div className="mt-2.5 text-[22px] font-semibold tracking-[-0.035em] text-[#1B1A18]">{value}</div>
      <div className={`mt-1 text-[9px] ${warning ? "text-[#8B4937]" : "text-[#8A867F]"}`}>{detail}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-2xl border border-black/[0.07] bg-white p-4 transition hover:border-[#A37849]/30 hover:bg-[#FFFCF8]">{body}</Link>
  ) : (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-4">{body}</div>
  );
}

export default function FinanceCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "Select legal entity";

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
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Finance workspace failed (${response.status})`);
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError.message || "Finance workspace could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, periodId]);

  const currency = data?.context?.currency || businessContext.entity?.currency || businessContext.organization?.default_currency || null;
  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const close = data?.close || { steps: [], completed: 0, total: 0, progress: 0 };
  const recentWork = Array.isArray(data?.recent_work) ? data.recent_work : [];

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 text-[#1B1A18]">
      <section className="rounded-[24px] border border-black/[0.07] bg-white px-5 py-4 shadow-[0_8px_28px_rgba(31,27,20,0.04)] md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-[#A37849]">Finance overview</div>
            <h1 className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#1B1A18]">What needs your attention now</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#817B73]">
              <span className="font-medium text-[#625D56]">{entityName}</span>
              <span>·</span>
              <span>{periodLabel(businessContext.period)}</span>
              {data?.context?.period_status ? <><span>·</span><span className="text-[#8A633C]">{titleCase(data.context.period_status)}</span></> : null}
            </div>
          </div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] disabled:opacity-50 lg:self-auto"><RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </section>

      {!entityId || !periodId ? (
        <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[11px] text-amber-900">Select a legal entity and accounting period in the top bar to load financial truth, close status and exceptions.</section>
      ) : error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-5 text-[10px] text-red-800"><div className="flex items-start gap-2"><AlertTriangle size={13} className="mt-0.5" /><div><div className="font-semibold">Finance overview could not load</div><div className="mt-1">{error}</div></div></div></section>
      ) : loading && !data ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#767169]"><LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />Loading financial truth…</div>
      ) : (
        <>
          <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
            <div className="flex items-end justify-between gap-3">
              <div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Attention</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Act on exceptions, not menus</h2></div>
              <Link href={financeHref(organizationId, "/finance/work")} className="text-[8px] font-semibold text-[#8A633C]">Open all work →</Link>
            </div>
            <div className="mt-3 divide-y divide-black/[0.055]">
              {queue.slice(0, 8).map((item) => <Link key={item.id} href={financeHref(organizationId, item.href)} className="group flex items-center justify-between gap-4 py-2.5"><div className="flex min-w-0 items-start gap-2.5"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.priority === "attention" ? "bg-red-600" : "bg-[#A37849]"}`} /><div className="min-w-0"><div className="truncate text-[10px] font-medium text-[#403C37]">{item.title}</div><div className="mt-0.5 truncate text-[8px] text-[#918B83]">{item.detail || titleCase(item.kind)}</div></div></div><ArrowRight size={10} className="shrink-0 text-[#B0ABA3] group-hover:text-[#A37849]" /></Link>)}
              {!queue.length ? <div className="flex items-center gap-2 py-5 text-[10px] text-[#65715F]"><BadgeCheck size={13} />Nothing currently requires intervention.</div> : null}
            </div>
          </section>

          <section>
            <div className="mb-2"><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Financial truth</div><div className="mt-0.5 text-[9px] text-[#918B83]">Current period balances and control state. Click through only when detail is needed.</div></div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MetricCard label="Receivables" value={money(metrics.receivables?.amount, currency)} detail={`${metrics.receivables?.count || 0} open · ${metrics.receivables?.overdue || 0} overdue`} icon={CircleDollarSign} warning={(metrics.receivables?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/ar")} />
              <MetricCard label="Payables" value={money(metrics.payables?.amount, currency)} detail={`${metrics.payables?.count || 0} open · ${metrics.payables?.overdue || 0} overdue`} icon={Banknote} warning={(metrics.payables?.overdue || 0) > 0} href={financeHref(organizationId, "/finance/ap")} />
              <MetricCard label="Reconciliation" value={String(metrics.reconciliation?.count || 0)} detail={`${money(metrics.reconciliation?.difference, currency)} difference`} icon={Landmark} warning={(metrics.reconciliation?.count || 0) > 0} href={financeHref(organizationId, "/finance/bank-reconciliation")} />
              <MetricCard label="Review" value={String(metrics.review?.count || 0)} detail={`${metrics.review?.ready || 0} ready · ${metrics.review?.changes_requested || 0} changes`} icon={ClipboardCheck} warning={(metrics.review?.ready || 0) > 0 || (metrics.review?.changes_requested || 0) > 0} href={financeHref(organizationId, "/finance/review")} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Close</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Period completion</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Only incomplete close work stays prominent.</div></div><Link href={financeHref(organizationId, "/finance/close")} className="text-[8px] font-semibold text-[#8A633C]">Open close →</Link></div>
              <div className="mt-4 flex items-center justify-between gap-3 text-[9px]"><span className="font-medium text-[#514E48]">{titleCase(metrics.close?.status || "not started")}</span><span className="tabular-nums text-[#756F67]">{close.completed || 0}/{close.total || 0} · {close.progress || 0}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-[#A37849]" style={{ width: `${Math.max(0, Math.min(100, close.progress || 0))}%` }} /></div>
              <div className="mt-3 divide-y divide-black/[0.055]">{(close.steps || []).filter((step) => !step.complete).slice(0, 5).map((step) => <Link key={step.id} href={financeHref(organizationId, "/finance/close")} className="group flex items-center justify-between gap-3 py-2.5"><div className="flex min-w-0 items-center gap-2.5"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#B18150]" /><div className="min-w-0"><div className="truncate text-[9px] font-medium text-[#403C37]">{step.label}</div><div className="mt-0.5 text-[8px] text-[#918B83]">{titleCase(step.status || "Open")}{step.has_evidence ? " · Evidence attached" : ""}</div></div></div><ChevronRight size={10} className="text-[#B0ABA3] group-hover:text-[#A37849]" /></Link>)}{(close.steps || []).filter((step) => !step.complete).length === 0 ? <div className="flex items-center gap-2 py-4 text-[9px] text-[#65715F]"><CheckCircle2 size={12} />No incomplete close steps.</div> : null}</div>
            </section>

            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">Recent work</div><h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">Where the team was last</h2><div className="mt-0.5 text-[9px] text-[#918B83]">Latest governed accounting procedures across clients.</div></div><Link href={financeHref(organizationId, "/finance/work")} className="text-[8px] font-semibold text-[#8A633C]">Open work →</Link></div>
              <div className="mt-3 divide-y divide-black/[0.055]">{recentWork.map((item) => <Link key={item.id} href={financeHref(organizationId, item.href)} className="group flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><div className="truncate text-[9px] font-medium text-[#403C37]">{item.title}</div><div className="mt-0.5 flex min-w-0 gap-2 overflow-hidden text-[8px] text-[#918B83]"><span className="truncate">{item.client_name}</span><span className="shrink-0">· {titleCase(item.status)}</span>{item.required_role ? <span className="shrink-0">· {titleCase(item.required_role)}</span> : null}</div></div><ChevronRight size={10} className="shrink-0 text-[#B0ABA3] group-hover:text-[#A37849]" /></Link>)}{!recentWork.length ? <div className="py-4 text-[9px] text-[#918B83]">Recent governed work will appear here as accounting procedures are updated.</div> : null}</div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
