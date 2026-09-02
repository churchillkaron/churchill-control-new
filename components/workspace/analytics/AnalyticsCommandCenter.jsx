"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  LineChart,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const DOMAIN_META = {
  finance: { label: "Finance", icon: CircleDollarSign },
  commercial: { label: "Commercial", icon: TrendingUp },
  operations: { label: "Operations", icon: Activity },
  "supply-chain": { label: "Supply Chain", icon: Boxes },
  people: { label: "People", icon: Users },
  projects: { label: "Projects", icon: Target },
};

function clean(value) {
  return String(value ?? "").trim();
}

function formatNumber(value, maximumFractionDigits = 2) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(Number.isFinite(number) ? number : 0);
}

function formatCurrency(value, currency) {
  const number = Number(value ?? 0);
  if (!currency) return formatNumber(number);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${currency} ${formatNumber(number)}`;
  }
}

function formatMetric(metric) {
  if (metric?.mixedCurrency) return "Multiple currencies";
  if (metric?.value === null || metric?.value === undefined) return "—";
  if (metric.unit === "currency") return formatCurrency(metric.value, metric.currency);
  if (metric.unit === "minutes") return `${formatNumber(metric.value, 0)} min`;
  return formatNumber(metric.value, 0);
}

function timestamp(value) {
  if (!value) return "No source rows yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ScopePill({ children, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#FAF9F7] px-3 py-1.5 text-[11px] text-[#666159]">
      {Icon ? <Icon size={12} className="text-[#A37849]" /> : null}
      {children}
    </span>
  );
}

function MetricCard({ metric }) {
  const meta = DOMAIN_META[metric.domain] || { label: metric.domain, icon: BarChart3 };
  const Icon = meta.icon;
  const attention = metric.status === "attention" || metric.mixedCurrency;
  const target = metric.configuration?.target_value;

  return (
    <Link
      href={metric.href || "#"}
      className="group rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)] transition hover:-translate-y-0.5 hover:border-[#D6A66A]/50 hover:shadow-[0_10px_28px_rgba(31,27,20,0.06)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#817D76]">
          <Icon size={14} className="shrink-0 text-[#A37849]" />
          <span className="truncate">{meta.label}</span>
        </div>
        {attention ? <AlertTriangle size={14} className="shrink-0 text-amber-700" /> : <CheckCircle2 size={14} className="shrink-0 text-emerald-650" />}
      </div>
      <div className="mt-4 text-[23px] font-semibold tracking-[-0.035em] text-[#1B1A18]">{formatMetric(metric)}</div>
      <div className="mt-1 text-[12px] font-medium text-[#504C46]">{metric.shortLabel || metric.label}</div>
      <div className="mt-2 line-clamp-2 min-h-[34px] text-[11px] leading-[17px] text-[#8A867F]">{metric.description}</div>
      {metric.mixedCurrency && Array.isArray(metric.valuesByCurrency) ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {metric.valuesByCurrency.slice(0, 3).map((entry) => (
            <span key={entry.currency} className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-900">
              {formatCurrency(entry.value, entry.currency)}
            </span>
          ))}
        </div>
      ) : target !== null && target !== undefined ? (
        <div className="mt-3 text-[10px] text-[#77726B]">Target {metric.unit === "currency" ? formatCurrency(target, metric.currency) : formatNumber(target)}</div>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/[0.055] pt-3 text-[10px] text-[#918C84]">
        <span>{metric.evidenceCount || 0} source row{metric.evidenceCount === 1 ? "" : "s"}</span>
        <span className="inline-flex items-center gap-1 group-hover:text-[#8B6238]">Drill through <ArrowRight size={11} /></span>
      </div>
    </Link>
  );
}

function MetricTable({ metrics, query, domain }) {
  const rows = useMemo(() => {
    const needle = clean(query).toLowerCase();
    return metrics.filter((metric) => {
      if (domain !== "all" && metric.domain !== domain) return false;
      if (!needle) return true;
      return [metric.label, metric.shortLabel, metric.description, metric.domain, ...(metric.sourceTables || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [metrics, query, domain]);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead className="bg-[#FAF9F7] text-[10px] font-medium uppercase tracking-[0.13em] text-[#807B73]">
            <tr>
              <th className="px-4 py-3">Metric</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3 text-right">Current</th>
              <th className="px-4 py-3">Evidence</th>
              <th className="px-4 py-3">Freshness</th>
              <th className="px-4 py-3">Definition</th>
              <th className="w-14 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.055] text-[12px]">
            {rows.map((metric) => (
              <tr key={metric.id} className="hover:bg-[#FCFBF9]">
                <td className="px-4 py-3.5">
                  <div className="font-medium text-[#2C2A26]">{metric.label}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-[#99938B]">{metric.id}</div>
                </td>
                <td className="px-4 py-3.5 text-[#68635C]">{DOMAIN_META[metric.domain]?.label || metric.domain}</td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#25231F]">{formatMetric(metric)}</td>
                <td className="px-4 py-3.5 text-[#68635C]">{metric.evidenceCount || 0} rows</td>
                <td className="px-4 py-3.5 text-[#68635C]">{timestamp(metric.watermark)}</td>
                <td className="max-w-[350px] px-4 py-3.5 text-[11px] leading-[17px] text-[#77726A]">{metric.aggregation} · {(metric.sourceTables || []).join(", ")}</td>
                <td className="px-4 py-3.5 text-right">
                  <Link href={metric.href || "#"} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/[0.08] text-[#7A746C] hover:border-[#D6A66A]/50 hover:text-[#8B6238]">
                    <ArrowRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[12px] text-[#8A867F]">No metrics match this view.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AnalyticsCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName = businessContext.entity?.display_name || businessContext.entity?.legal_name || businessContext.entity?.name || "All entities";
  const periodName = businessContext.period?.label || businessContext.period?.name || (businessContext.period?.start_date && businessContext.period?.end_date ? `${businessContext.period.start_date} – ${businessContext.period.end_date}` : "Current business state");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("all");
  const [tab, setTab] = useState("overview");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/workspace/analytics/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      if (periodId) url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Analytics failed (${response.status})`);
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError?.message || "Analytics could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const metrics = Array.isArray(data?.metrics) ? data.metrics : [];
  const attention = Array.isArray(data?.attention) ? data.attention : [];
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  const forecasts = Array.isArray(data?.forecasts) ? data.forecasts : [];
  const snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const sourceErrors = sources.filter((entry) => entry.status !== "connected");
  const connectedSources = sources.filter((entry) => entry.status === "connected").length;

  const domainSummary = useMemo(() => {
    return Object.entries(DOMAIN_META).map(([id, meta]) => {
      const domainMetrics = metrics.filter((metric) => metric.domain === id);
      return {
        id,
        ...meta,
        count: domainMetrics.length,
        attention: domainMetrics.filter((metric) => metric.status === "attention" || metric.mixedCurrency).length,
      };
    });
  }, [metrics]);

  return (
    <div className="mx-auto max-w-[1750px] space-y-5 pb-10 text-[#1B1A18]">
      <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#A37849]">Analytics</div>
            <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18]">Business Intelligence</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
              One governed metric layer across the business. Every number keeps its definition, source evidence, freshness and drill-through to the operating record.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ScopePill icon={Building2}>{entityName}</ScopePill>
              <ScopePill icon={Clock3}>{periodName}</ScopePill>
              <ScopePill icon={ShieldCheck}>{data?.catalogVersion || "Semantic metrics"}</ScopePill>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setTab("metrics")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[12px] font-medium text-[#4B4842] hover:border-[#D6A66A]/55 hover:bg-[#D6A66A]/[0.05]">
              <BarChart3 size={14} className="text-[#A37849]" /> Metric library
            </button>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[12px] font-medium text-white hover:bg-black disabled:opacity-50">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-black/[0.07] bg-white p-1">
        {[['overview', 'Overview'], ['metrics', 'Metrics'], ['alerts', `Alerts${alerts.length ? ` · ${alerts.length}` : ''}`], ['forecasts', `Forecasts${forecasts.length ? ` · ${forecasts.length}` : ''}`], ['lineage', 'Lineage']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-3.5 py-2 text-[11px] font-medium transition ${tab === id ? "bg-[#1F1E1B] text-white" : "text-[#68635C] hover:bg-[#F7F5F1]"}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-5">
          <div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5 text-red-700" /><div><div className="text-sm font-semibold text-red-900">Analytics could not load</div><div className="mt-1 text-[12px] text-red-800">{error}</div></div></div>
        </section>
      ) : loading && !data ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-black/[0.075] bg-white text-[13px] text-[#767169]">
          <LoaderCircle size={18} className="mr-2 animate-spin text-[#A37849]" /> Building governed business view…
        </div>
      ) : tab === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.slice(0, 5).map((metric) => <MetricCard key={metric.id} metric={metric} />)}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Business pulse</div><h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em]">Across every operating domain</h2></div>
                <button type="button" onClick={() => setTab("metrics")} className="text-[11px] font-medium text-[#8B6238]">Explore all metrics</button>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {domainSummary.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} type="button" onClick={() => { setDomain(item.id); setTab("metrics"); }} className="flex items-center gap-3 rounded-xl border border-black/[0.065] bg-[#FCFBF9] p-3 text-left hover:border-[#D6A66A]/45">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#A37849] shadow-sm"><Icon size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-[#38352F]">{item.label}</span><span className="mt-0.5 block text-[10px] text-[#8A867F]">{item.count} metrics · {item.attention} attention</span></span>
                      <ArrowRight size={13} className="text-[#AAA39A]" />
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metrics.slice(5).map((metric) => <MetricCard key={metric.id} metric={metric} />)}
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
                <div className="flex items-center justify-between"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Attention</div><h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">What changed or needs review</h2></div><AlertTriangle size={17} className={attention.length ? "text-amber-700" : "text-emerald-650"} /></div>
                <div className="mt-4 divide-y divide-black/[0.055]">
                  {attention.slice(0, 8).map((item) => (
                    <Link key={`${item.type}-${item.metricId}`} href={item.href || "#"} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-600" />
                      <span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-[#38352F]">{item.label}</span><span className="mt-1 block text-[10px] leading-4 text-[#817D76]">{item.detail}</span></span>
                      <ArrowRight size={12} className="mt-1 text-[#A9A29A]" />
                    </Link>
                  ))}
                  {!attention.length ? <div className="py-6 text-center text-[11px] text-[#837E76]">No semantic metric requires attention.</div> : null}
                </div>
              </section>

              <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
                <div className="flex items-center justify-between"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Trust</div><h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">Source health</h2></div><Database size={16} className="text-[#A37849]" /></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[#FAF9F7] p-3"><div className="text-xl font-semibold">{connectedSources}</div><div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#8A867F]">Connected</div></div>
                  <div className="rounded-xl bg-[#FAF9F7] p-3"><div className="text-xl font-semibold">{sourceErrors.length}</div><div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#8A867F]">Errors</div></div>
                  <div className="rounded-xl bg-[#FAF9F7] p-3"><div className="text-xl font-semibold">{snapshots.length}</div><div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#8A867F]">Snapshots</div></div>
                </div>
                <button type="button" onClick={() => setTab("lineage")} className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8B6238]">Inspect lineage <ArrowRight size={12} /></button>
              </section>
            </div>
          </div>
        </>
      ) : tab === "metrics" ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-black/[0.075] bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">Semantic layer</div><div className="mt-1 text-[13px] font-medium text-[#38352F]">Verified business definitions, not free-form dashboard math.</div></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search metrics or sources" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[11px] outline-none focus:border-[#D6A66A] sm:w-56" /></label>
              <select value={domain} onChange={(event) => setDomain(event.target.value)} className="h-9 rounded-lg border border-black/[0.09] bg-[#FCFBF9] px-3 text-[11px] outline-none focus:border-[#D6A66A]">
                <option value="all">All domains</option>{Object.entries(DOMAIN_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
              </select>
            </div>
          </div>
          <MetricTable metrics={metrics} query={query} domain={domain} />
        </section>
      ) : tab === "alerts" ? (
        <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
          <div className="flex items-start justify-between"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Metric monitoring</div><h2 className="mt-1 text-[20px] font-semibold">Threshold & exception alerts</h2><p className="mt-1 text-[11px] text-[#817D76]">Open and acknowledged events preserve the observed value, rule threshold and trigger evidence.</p></div><AlertTriangle size={17} className="text-[#A37849]" /></div>
          <div className="mt-5 divide-y divide-black/[0.055]">
            {alerts.map((alert) => {
              const metric = metrics.find((entry) => entry.id === alert.metric_id);
              return <div key={alert.id} className="grid gap-2 py-3.5 md:grid-cols-[minmax(0,1fr)_160px_160px]"><div><div className="text-[12px] font-medium text-[#37342F]">{metric?.label || alert.metric_id}</div><div className="mt-1 text-[10px] text-[#8A867F]">Triggered {timestamp(alert.triggered_at)} · {alert.status}</div></div><div className="text-[11px] text-[#68635C]">Observed <span className="font-semibold text-[#302D29]">{formatNumber(alert.observed_value)}</span></div><div className="text-[11px] text-[#68635C]">Threshold <span className="font-semibold text-[#302D29]">{formatNumber(alert.threshold_value)}</span></div></div>;
            })}
            {!alerts.length ? <div className="py-12 text-center"><CheckCircle2 size={22} className="mx-auto text-emerald-600" /><div className="mt-3 text-[12px] font-medium text-[#4D4942]">No open metric alerts</div><div className="mt-1 text-[10px] text-[#8A867F]">Alert evidence will appear here when configured rules trigger.</div></div> : null}
          </div>
        </section>
      ) : tab === "forecasts" ? (
        <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
          <div className="flex items-start justify-between"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Forecast evidence</div><h2 className="mt-1 text-[20px] font-semibold">Reproducible forward view</h2><p className="mt-1 text-[11px] text-[#817D76]">Forecasts stay separate from actuals and always expose method, as-of date and model version.</p></div><LineChart size={18} className="text-[#A37849]" /></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[11px]"><thead className="border-b border-black/[0.07] text-[9px] uppercase tracking-[0.13em] text-[#8A867F]"><tr><th className="py-3 pr-4">Metric</th><th className="py-3 pr-4">As of</th><th className="py-3 pr-4">Forecast date</th><th className="py-3 pr-4 text-right">Predicted</th><th className="py-3 pr-4">Method</th><th className="py-3">Version</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{forecasts.map((row, index) => <tr key={`${row.metric_id}-${row.forecast_date}-${index}`}><td className="py-3 pr-4 font-medium text-[#3A3732]">{metrics.find((metric) => metric.id === row.metric_id)?.label || row.metric_id}</td><td className="py-3 pr-4 text-[#77726A]">{row.as_of_date}</td><td className="py-3 pr-4 text-[#77726A]">{row.forecast_date}</td><td className="py-3 pr-4 text-right font-semibold tabular-nums">{formatNumber(row.predicted_value)}</td><td className="py-3 pr-4 text-[#77726A]">{row.method}</td><td className="py-3 text-[#77726A]">{row.model_version}</td></tr>)}</tbody></table>{!forecasts.length ? <div className="py-12 text-center text-[11px] text-[#8A867F]">No forecast runs yet. Analytics will not fabricate a prediction before a governed forecast definition has run.</div> : null}</div>
        </section>
      ) : (
        <section className="rounded-[24px] border border-black/[0.075] bg-white p-5">
          <div className="flex items-start justify-between"><div><div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8A867F]">Lineage & freshness</div><h2 className="mt-1 text-[20px] font-semibold">Know where every number came from</h2><p className="mt-1 text-[11px] text-[#817D76]">Analytics reads authoritative domain tables. Control-state tables hold targets, follows, alerts, snapshots and forecasts only.</p></div><Database size={18} className="text-[#A37849]" /></div>
          <div className="mt-5 divide-y divide-black/[0.055]">
            {sources.map((entry) => <div key={entry.name} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_110px_110px_150px]"><div><div className="font-mono text-[11px] font-medium text-[#3F3B36]">{entry.name}</div>{entry.error ? <div className="mt-1 text-[10px] text-red-700">{entry.error}</div> : null}</div><div className="text-[11px] text-[#706B63]">{entry.rowCount || 0} rows</div><div className="text-[11px] text-[#706B63]">{entry.durationMs || 0} ms</div><div className={`text-[11px] font-medium ${entry.status === "connected" ? "text-emerald-700" : "text-red-700"}`}>{entry.status}</div></div>)}
          </div>
        </section>
      )}
    </div>
  );
}
