"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  TimerReset,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function titleCase(value) {
  return text(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function href(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function Metric({ label, value, detail, icon: Icon, warning = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#817D76]">{label}</div>
        <Icon size={15} className={warning ? "text-amber-700" : "text-[#A37849]"} />
      </div>
      <div className="mt-3 text-[24px] font-semibold tracking-[-0.035em] text-[#1B1A18]">{value}</div>
      <div className={`mt-1.5 text-[11px] ${warning ? "text-amber-800" : "text-[#8A867F]"}`}>{detail}</div>
    </div>
  );
}

const SPECIALIST_LINKS = [
  ["Frameworks & requirements", "/compliance/frameworks", BookOpenCheck],
  ["Controls & testing", "/compliance/controls", ShieldCheck],
  ["Evidence", "/compliance/evidence", FileCheck2],
  ["Obligations & renewals", "/compliance/obligations", TimerReset],
  ["Risks", "/compliance/risks", Target],
  ["Issues & remediation", "/compliance/issues", ShieldAlert],
  ["Audit trail", "/compliance/audit", ClipboardCheck],
];

export default function ComplianceCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    "All entities";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/workspace/compliance/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      if (periodId) url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Compliance workspace failed (${response.status})`);
      }
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError?.message || "Compliance workspace could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const flow = Array.isArray(data?.flow) ? data.flow : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const sourceErrors = sources.filter((entry) => entry.status !== "connected");

  const filteredQueue = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return queue;
    return queue.filter((item) =>
      [item.title, item.detail, item.status, item.kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [queue, query]);

  return (
    <div className="mx-auto max-w-[1750px] space-y-5 pb-10 text-[#1B1A18]">
      <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">Compliance</div>
            <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em]">Control & Assurance</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
              Know every obligation, prove every control, surface failed evidence early, and move findings into verified remediation without leaving the business record.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[#6F6B64]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5"><Building2 size={12} className="text-[#A37849]" />{entityName}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{data?.context?.business_date || "Current date"}</span>
              <span className="rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5">{sourceErrors.length ? `${sourceErrors.length} source issue${sourceErrors.length === 1 ? "" : "s"}` : "All control sources connected"}</span>
            </div>
          </div>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[12px] font-medium text-white hover:bg-black disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-5 text-[12px] text-red-900">
          <div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5" /><div><div className="font-semibold">Compliance workspace could not load</div><div className="mt-1">{error}</div></div></div>
        </section>
      ) : loading && !data ? (
        <div className="flex min-h-[340px] items-center justify-center rounded-2xl border border-black/[0.075] bg-white text-[13px] text-[#767169]">
          <LoaderCircle size={18} className="mr-2 animate-spin text-[#A37849]" /> Loading control state…
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Frameworks" value={metrics.frameworks?.active || 0} detail={`${metrics.frameworks?.requirements || 0} active requirements`} icon={BookOpenCheck} />
            <Metric label="Controls" value={metrics.controls?.active || 0} detail={`${metrics.controls?.ineffective || 0} ineffective · ${metrics.controls?.unowned || 0} unowned`} icon={ShieldCheck} warning={(metrics.controls?.ineffective || 0) > 0} />
            <Metric label="Evidence" value={metrics.evidence?.total || 0} detail={`${metrics.evidence?.unverified || 0} unverified · ${metrics.evidence?.expired || 0} expired`} icon={FileCheck2} warning={(metrics.evidence?.expired || 0) > 0} />
            <Metric label="Obligations" value={metrics.obligations?.open || 0} detail={`${metrics.obligations?.overdue || 0} overdue · ${metrics.obligations?.renewal_due || 0} renewal due`} icon={TimerReset} warning={(metrics.obligations?.overdue || 0) > 0 || (metrics.obligations?.expired || 0) > 0} />
            <Metric label="High risks" value={metrics.risks?.high || 0} detail={`${metrics.risks?.open || 0} open · ${metrics.risks?.reviews_due || 0} reviews due`} icon={Target} warning={(metrics.risks?.high || 0) > 0} />
            <Metric label="Open issues" value={metrics.issues?.open || 0} detail={`${metrics.issues?.critical || 0} high/critical · ${metrics.issues?.remediation_overdue || 0} remediation overdue`} icon={ShieldAlert} warning={(metrics.issues?.critical || 0) > 0 || (metrics.issues?.remediation_overdue || 0) > 0} />
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
            <div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Control lifecycle</div><h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em]">From obligation to verified closure</h2></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {flow.map((step, index) => (
                <Link key={step.id} href={href(organizationId, step.href)} className="group rounded-xl border border-black/[0.065] bg-[#FCFBF9] p-3 hover:border-[#D6A66A]/45">
                  <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#9A948C]">{String(index + 1).padStart(2, "0")}</div>
                  <div className="mt-2 text-[12px] font-medium text-[#393630]">{step.label}</div>
                  <div className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">{step.count || 0}</div>
                  <div className="mt-1 min-h-[30px] text-[10px] leading-4 text-[#817D76]">{step.detail}</div>
                  <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-[#8B6238]">Open <ArrowRight size={11} /></div>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Needs attention</div><h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Compliance work queue</h2></div>
                <label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search compliance work" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[11px] outline-none focus:border-[#D6A66A] sm:w-56" /></label>
              </div>
              <div className="mt-4 divide-y divide-black/[0.055]">
                {filteredQueue.map((item) => (
                  <Link key={item.id} href={href(organizationId, item.href)} className="grid gap-2 py-3.5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_130px]">
                    <div className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "critical" ? "bg-red-600" : item.priority === "attention" ? "bg-amber-600" : "bg-[#A37849]"}`} />
                      <div className="min-w-0"><div className="text-[12px] font-medium text-[#37342F]">{item.title}</div><div className="mt-1 text-[10px] leading-4 text-[#817D76]">{item.detail}</div></div>
                    </div>
                    <div className="flex items-center justify-between gap-2 md:justify-end"><span className="rounded-full border border-black/[0.07] bg-[#FAF9F7] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[#6E685F]">{titleCase(item.status)}</span><ArrowRight size={12} className="text-[#AAA39A]" /></div>
                  </Link>
                ))}
                {!filteredQueue.length ? <div className="py-10 text-center"><BadgeCheck size={22} className="mx-auto text-emerald-600" /><div className="mt-3 text-[12px] font-medium text-[#4D4942]">No current compliance exceptions</div><div className="mt-1 text-[10px] text-[#8A867F]">New obligations, failed tests, risk reviews and evidence gaps will appear here.</div></div> : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Specialist workspaces</div>
              <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Control system</h2>
              <div className="mt-4 divide-y divide-black/[0.055]">
                {SPECIALIST_LINKS.map(([label, route, Icon]) => (
                  <Link key={route} href={href(organizationId, route)} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FAF9F7] text-[#A37849]"><Icon size={14} /></span>
                    <span className="flex-1 text-[11px] font-medium text-[#4A4640]">{label}</span>
                    <ArrowRight size={12} className="text-[#AAA39A]" />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
