"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  FileCheck2,
  FileText,
  Landmark,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Scale,
  Search,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import FinancePracticeControlTower from "@/components/workspace/finance/FinancePracticeControlTower";
import { getWorkspaceGroups } from "@/lib/platform/registry/erpRegistry";
import { resolveWorkspaceRoute } from "@/lib/platform/routing/resolveWorkspaceRoute";

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

const QUICK_ACTIONS = [
  { label: "Customer invoice", route: "/finance/customer-invoices", icon: ReceiptText },
  { label: "Vendor bill", route: "/finance/vendor-bills", icon: FileText },
  { label: "Journal", route: "/finance/journals", icon: BookOpenCheck },
  { label: "Reports", route: "/finance/statements", icon: FileCheck2 },
];

const DAILY_WORK = [
  { label: "Customer Invoices", description: "Create, review, post and send invoices.", route: "/finance/customer-invoices", icon: ReceiptText },
  { label: "Vendor Bills", description: "Capture, approve and post supplier bills.", route: "/finance/vendor-bills", icon: FileText },
  { label: "Bank Reconciliation", description: "Match books to bank evidence and clear differences.", route: "/finance/bank-reconciliation", icon: Landmark },
  { label: "Journals", description: "Review controlled journals, posting and reversals.", route: "/finance/journals", icon: BookOpenCheck },
  { label: "Trial Balance", description: "Review balances and drill into ledger activity.", route: "/finance/trial-balance", icon: Scale },
  { label: "Financial Statements", description: "Profit & loss, balance sheet and cash flow.", route: "/finance/statements", icon: FileCheck2 },
];

function MetricCard({ label, value, detail, icon: Icon, warning = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#817D76]">{label}</div>
        <Icon size={15} className={warning ? "text-[#9A533D]" : "text-[#A37849]"} />
      </div>
      <div className="mt-3 text-[24px] font-semibold tracking-[-0.035em] text-[#1B1A18]">{value}</div>
      <div className={`mt-1.5 text-[11px] ${warning ? "text-[#8B4937]" : "text-[#8A867F]"}`}>{detail}</div>
    </div>
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
  const [query, setQuery] = useState("");

  const financeGroups = useMemo(() => getWorkspaceGroups("finance"), []);
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return financeGroups;
    return financeGroups
      .map((group) => ({
        ...group,
        items: (group.items || []).filter((item) => [group.name, group.description, item.name, item.description].filter(Boolean).join(" ").toLowerCase().includes(needle)),
      }))
      .filter((group) => group.items.length > 0);
  }, [financeGroups, query]);

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

  return (
    <div className="mx-auto max-w-[1720px] space-y-5 text-[#1B1A18]">
      <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">Finance · Accounting Firm</div>
            <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Accounting Control Center</h1>
            <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[#6F6B64]">Run client accounting, review, close and statutory work by exception. Partners see practice risk first; accountants keep direct access to the books underneath.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[#6F6B64]">
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{entityName}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{periodLabel(businessContext.period)}</span>
              {data?.context?.period_status ? <span className="rounded-full border border-[#A37849]/20 bg-[#A37849]/[0.07] px-3 py-1.5 text-[#8A633C]">{titleCase(data.context.period_status)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return <Link key={action.route} href={financeHref(organizationId, action.route)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[12px] font-medium text-[#4B4842] transition hover:border-[#D6A66A]/55 hover:bg-[#D6A66A]/[0.06]"><Icon size={14} className="text-[#A37849]" />{action.label}</Link>;
            })}
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh</button>
          </div>
        </div>
      </section>

      <FinancePracticeControlTower organizationId={organizationId} />

      {!entityId || !periodId ? (
        <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[13px] text-amber-900">Select a legal entity and accounting period in the top bar to open the client accounting work view.</section>
      ) : error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-5 text-[12px] text-red-800"><div className="flex items-start gap-3"><AlertTriangle size={17} className="mt-0.5" /><div><div className="font-semibold">Client accounting state could not load</div><div className="mt-1">{error}</div></div></div></section>
      ) : loading && !data ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-black/[0.075] bg-white text-[13px] text-[#767169]"><LoaderCircle size={18} className="mr-2 animate-spin text-[#A37849]" />Loading accounting state…</div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Review queue" value={String(metrics.review?.count || 0)} detail={`${metrics.review?.ready || 0} ready · ${metrics.review?.changes_requested || 0} changes`} icon={ClipboardCheck} warning={(metrics.review?.ready || 0) > 0 || (metrics.review?.changes_requested || 0) > 0} />
            <MetricCard label="Overdue review" value={String(metrics.review?.overdue || 0)} detail="Review work past deadline" icon={AlertTriangle} warning={(metrics.review?.overdue || 0) > 0} />
            <MetricCard label="Receivables" value={money(metrics.receivables?.amount, currency)} detail={`${metrics.receivables?.count || 0} open · ${metrics.receivables?.overdue || 0} overdue`} icon={CircleDollarSign} warning={(metrics.receivables?.overdue || 0) > 0} />
            <MetricCard label="Payables" value={money(metrics.payables?.amount, currency)} detail={`${metrics.payables?.count || 0} open · ${metrics.payables?.overdue || 0} overdue`} icon={Banknote} warning={(metrics.payables?.overdue || 0) > 0} />
            <MetricCard label="Reconciliation" value={String(metrics.reconciliation?.count || 0)} detail={`${money(metrics.reconciliation?.difference, currency)} difference`} icon={Landmark} warning={(metrics.reconciliation?.count || 0) > 0} />
            <MetricCard label="Close" value={`${metrics.close?.progress || 0}%`} detail={`${metrics.close?.completed || 0} of ${metrics.close?.total || 0} steps`} icon={BookOpenCheck} warning={(metrics.close?.progress || 0) < 100} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(380px,0.8fr)_minmax(0,1.2fr)]">
            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Exception workflow</div><h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em]">Needs attention</h2><p className="mt-1 text-[11px] leading-5 text-[#817D76]">Review points, approvals, reconciliations, filings and close work ranked together.</p></div><span className="rounded-full border border-black/[0.07] bg-[#FAF9F7] px-2.5 py-1 text-[10px] text-[#79746C]">{queue.length}</span></div>
              <div className="mt-4 divide-y divide-black/[0.06]">
                {queue.map((item) => <Link key={item.id} href={financeHref(organizationId, item.href)} className="group block py-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${item.priority === "attention" ? "bg-red-600" : "bg-[#A37849]"}`} /><div className="truncate text-[13px] font-medium text-[#37342F]">{item.title}</div></div><div className="mt-1 pl-3.5 text-[11px] leading-5 text-[#817D76]">{item.detail || titleCase(item.kind)}</div></div><ArrowRight size={13} className="mt-1 shrink-0 text-[#AAA59C] transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" /></div></Link>)}
                {!queue.length ? <div className="flex items-center gap-2 py-5 text-[12px] text-[#6F7868]"><BadgeCheck size={16} />Nothing currently requires intervention.</div> : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Period close</div><h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em]">Finish the period with evidence</h2><p className="mt-1 text-[11px] text-[#817D76]">Every incomplete close step remains visible until resolved.</p></div><Link href={financeHref(organizationId, "/finance/close")} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.08] px-3.5 py-2 text-[11px] font-medium text-[#4B4842] hover:border-[#D6A66A]/50">Open period close <ArrowRight size={13} /></Link></div>
              <div className="mt-5 rounded-2xl border border-black/[0.065] bg-[#FAF9F7] p-4"><div className="flex items-center justify-between gap-4 text-[11px]"><span className="font-medium text-[#514E48]">Close progress</span><span className="tabular-nums text-[#756F67]">{close.completed || 0}/{close.total || 0} · {close.progress || 0}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-[#A37849] transition-all" style={{ width: `${Math.max(0, Math.min(100, close.progress || 0))}%` }} /></div></div>
              <div className="mt-3 divide-y divide-black/[0.06]">{(close.steps || []).slice(0, 8).map((step) => <Link key={step.id} href={financeHref(organizationId, "/finance/close")} className="group flex items-center justify-between gap-4 py-3"><div className="flex min-w-0 items-center gap-3">{step.complete ? <CheckCircle2 size={16} className="shrink-0 text-emerald-700" /> : <span className="h-2 w-2 rounded-full bg-[#B18150]" />}<div className="min-w-0"><div className="truncate text-[12px] font-medium text-[#37342F]">{step.label}</div><div className="mt-0.5 text-[10px] text-[#8A867F]">{titleCase(step.status || "Open")}{step.has_evidence ? " · Evidence attached" : ""}</div></div></div><ChevronRight size={13} className="text-[#AAA59C] group-hover:text-[#A37849]" /></Link>)}</div>
            </section>
          </div>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Daily accounting</div><h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em]">Common work, one click away</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{DAILY_WORK.map((item) => { const Icon = item.icon; return <Link key={item.route} href={financeHref(organizationId, item.route)} className="group rounded-2xl border border-black/[0.07] bg-[#FBFAF8] p-4 transition hover:-translate-y-0.5 hover:border-[#D6A66A]/45 hover:bg-[#D6A66A]/[0.045]"><div className="flex items-start justify-between gap-3"><div className="rounded-xl border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] p-2 text-[#9A7045]"><Icon size={17} /></div><ArrowRight size={14} className="mt-1 text-[#B4AFA6] group-hover:text-[#A37849]" /></div><div className="mt-3 text-[13px] font-semibold text-[#38352F]">{item.label}</div><div className="mt-1 text-[11px] leading-5 text-[#817D76]">{item.description}</div></Link>; })}</div>
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Explore Finance</div><h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em]">Specialist capabilities</h2><p className="mt-1 text-[12px] text-[#817D76]">Registry-driven specialist work stays available without crowding the daily workflow.</p></div><div className="flex w-full items-center rounded-xl border border-black/[0.08] bg-[#FAF9F7] px-3.5 md:w-[330px]"><Search size={14} className="text-[#8D8880]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a Finance capability…" className="h-10 w-full bg-transparent pl-2.5 text-[12px] text-[#37342F] outline-none placeholder:text-[#A5A097]" /></div></div>
            <div className="mt-5 grid gap-x-7 gap-y-5 lg:grid-cols-2 xl:grid-cols-3">{filteredGroups.map((group) => <div key={group.id}><div className="mb-2"><div className="text-[12px] font-semibold text-[#46423C]">{group.name}</div><div className="mt-0.5 text-[10px] leading-4 text-[#99948B]">{group.description}</div></div><div className="divide-y divide-black/[0.05] border-t border-black/[0.05]">{(group.items || []).map((item) => { const disabled = ["planned", "blocked", "disabled", "unavailable"].includes(text(item.status).toLowerCase()); const href = resolveWorkspaceRoute({ organizationId, workspaceId: "finance", moduleId: item.id, route: item.route }); return disabled ? <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 opacity-45"><span className="truncate text-[11px] text-[#5E5A53]">{item.name}</span><span className="text-[9px] uppercase tracking-[0.1em] text-[#8F8A82]">{titleCase(item.status || "Unavailable")}</span></div> : <Link key={item.id} href={href} className="group flex items-center justify-between gap-3 py-2.5"><span className="truncate text-[11px] text-[#5E5A53] group-hover:text-[#8A633C]">{item.name}</span><ChevronRight size={12} className="shrink-0 text-[#B6B1A8] group-hover:text-[#A37849]" /></Link>; })}</div></div>)}</div>
          </section>
        </>
      )}
    </div>
  );
}
