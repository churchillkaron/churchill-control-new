"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  Cable,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Database,
  LoaderCircle,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const MODES = [
  ["overview", "Overview", "/services"],
  ["services", "Services", "/services/connected-services"],
  ["wallet", "Wallet", "/services/wallet"],
  ["usage", "Usage", "/services/usage"],
  ["billing", "Billing", "/services/billing"],
  ["integrations", "Integrations", "/services/integrations"],
];

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value, currency) {
  const amount = number(value);
  if (!currency || currency === "UNSPECIFIED") return amount.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function time(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function href(organizationId, route) {
  return `/workspace/${organizationId}${route}`;
}

function Metric({ label, value, detail, icon: Icon, warning = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4">
      <div className="flex items-start justify-between gap-3"><div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#817D76]">{label}</div><Icon size={14} className={warning ? "text-amber-700" : "text-[#A37849]"} /></div>
      <div className="mt-3 text-[24px] font-semibold tracking-[-0.035em]">{value}</div>
      <div className={`mt-1 text-[10px] ${warning ? "text-amber-800" : "text-[#8A867F]"}`}>{detail}</div>
    </div>
  );
}

function CurrencyRows({ rows, fields }) {
  if (!rows?.length) return <div className="py-8 text-center text-[11px] text-[#8A867F]">No monetary activity yet.</div>;
  return (
    <div className="divide-y divide-black/[0.055]">
      {rows.map((row) => (
        <div key={row.currency} className="grid gap-2 py-3 text-[11px] sm:grid-cols-[120px_repeat(2,minmax(0,1fr))]">
          <div className="font-semibold text-[#3A3732]">{row.currency}</div>
          {fields.map(([field, label]) => <div key={field}><span className="text-[#8A847C]">{label}</span><div className="mt-0.5 font-medium tabular-nums text-[#4A4640]">{money(row[field], row.currency)}</div></div>)}
        </div>
      ))}
    </div>
  );
}

export default function ServicesWorkspace({ organizationId, mode = "overview" }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/workspace/services/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      if (periodId) url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) throw new Error(json?.error || `Services failed (${response.status})`);
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError?.message || "Services could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const recentUsage = Array.isArray(data?.recentUsage) ? data.recentUsage : [];
  const services = Array.isArray(data?.services) ? data.services : [];
  const integrations = Array.isArray(data?.integrations) ? data.integrations : [];
  const providers = Array.isArray(data?.topProviders) ? data.topProviders : [];
  const sources = Array.isArray(data?.sources) ? data.sources : [];

  const filteredUsage = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return recentUsage;
    return recentUsage.filter((row) => [row.provider, row.capability, row.operation, row.status, row.execution_status, row.error_message].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [recentUsage, query]);

  const billingQueue = queue.filter((item) => ["billing", "reconciliation"].includes(item.kind));
  const walletRows = metrics.wallets?.by_currency || [];
  const usageRows = metrics.usage?.by_currency || [];

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1750px] space-y-5">
        <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.045)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Services</div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em]">Service & Spend Control</h1>
              <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[#706B64]">Wallet, provider execution, usage, billing, reconciliation and integration health from one governed operating view.</p>
            </div>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[11px] font-medium text-white disabled:opacity-40"><RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh</button>
          </div>
        </section>

        <nav className="flex flex-wrap gap-1 rounded-xl border border-black/[0.07] bg-white p-1">
          {MODES.map(([id, label, route]) => <Link key={id} href={href(organizationId, route)} className={`rounded-lg px-3.5 py-2 text-[10px] font-medium ${mode === id ? "bg-[#1F1E1B] text-white" : "text-[#68635C] hover:bg-[#F7F5F1]"}`}>{label}</Link>)}
        </nav>

        {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800"><AlertTriangle size={13} className="mr-2 inline" />{error}</div> : null}
        {loading && !data ? <div className="flex min-h-[340px] items-center justify-center rounded-2xl border border-black/[0.075] bg-white text-[12px] text-[#817D76]"><LoaderCircle size={17} className="mr-2 animate-spin" />Loading service control state…</div> : null}

        {data && mode === "overview" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Wallets" value={metrics.wallets?.total || 0} detail={`${metrics.wallets?.low_balance || 0} low balance`} icon={WalletCards} warning={(metrics.wallets?.low_balance || 0) > 0} />
              <Metric label="Services" value={metrics.services?.active || 0} detail={`${metrics.services?.unhealthy || 0} unhealthy · ${metrics.services?.budget_risk || 0} budget risk`} icon={Boxes} warning={(metrics.services?.unhealthy || 0) > 0 || (metrics.services?.budget_risk || 0) > 0} />
              <Metric label="Usage · 30d" value={metrics.usage?.last_30d || 0} detail={`${metrics.usage?.today || 0} today · ${metrics.usage?.failures_30d || 0} failures`} icon={Activity} warning={(metrics.usage?.failures_30d || 0) > 0} />
              <Metric label="Billing" value={(metrics.billing?.queue_open || 0) + (metrics.billing?.reconciliation_open || 0)} detail={`${metrics.billing?.queue_open || 0} queued · ${metrics.billing?.reconciliation_open || 0} reconciliation`} icon={BadgeDollarSign} warning={(metrics.billing?.queue_open || 0) + (metrics.billing?.reconciliation_open || 0) > 0} />
              <Metric label="Integrations" value={metrics.integrations?.total || 0} detail={`${metrics.integrations?.unhealthy || 0} unhealthy`} icon={Cable} warning={(metrics.integrations?.unhealthy || 0) > 0} />
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
              <section className="rounded-[22px] border border-black/[0.075] bg-white p-5">
                <div className="flex items-center justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A847C]">Needs attention</div><h2 className="mt-1 text-[18px] font-semibold">Service operating queue</h2></div><AlertTriangle size={16} className={queue.length ? "text-amber-700" : "text-emerald-600"} /></div>
                <div className="mt-4 divide-y divide-black/[0.055]">
                  {queue.slice(0, 16).map((item) => <Link key={item.id} href={href(organizationId, item.href || "/services")} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === "critical" ? "bg-red-600" : item.priority === "attention" ? "bg-amber-600" : "bg-[#A37849]"}`} /><span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-[#403C36]">{item.title}</span><span className="mt-0.5 block text-[9px] leading-4 text-[#8A847C]">{item.detail}</span></span><span className="text-[9px] text-[#8A847C]">{item.status}</span></Link>)}
                  {!queue.length ? <div className="py-10 text-center"><CheckCircle2 size={21} className="mx-auto text-emerald-600" /><div className="mt-2 text-[11px] font-medium">No current service exceptions</div></div> : null}
                </div>
              </section>

              <section className="rounded-[22px] border border-black/[0.075] bg-white p-5">
                <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A847C]">30-day provider activity</div>
                <div className="mt-4 divide-y divide-black/[0.055]">{providers.slice(0, 10).map((row) => <div key={row.provider} className="grid grid-cols-[minmax(0,1fr)_70px_70px] gap-3 py-2.5 text-[10px]"><div className="truncate font-medium text-[#4A4640]">{row.provider}</div><div className="text-right text-[#77716A]">{row.requests} req</div><div className={`text-right ${row.failures ? "text-amber-800" : "text-[#77716A]"}`}>{row.failures} fail</div></div>)}</div>
              </section>
            </div>

            <section className="rounded-[22px] border border-black/[0.075] bg-white p-5"><div className="flex items-center justify-between"><div><div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A847C]">Trust</div><h2 className="mt-1 text-[18px] font-semibold">Source health</h2></div><Database size={15} className="text-[#A37849]" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{sources.map((row) => <div key={row.name} className="rounded-xl border border-black/[0.06] bg-[#FCFBF9] p-3"><div className="font-mono text-[9px] text-[#5E5952]">{row.name}</div><div className="mt-2 flex justify-between text-[9px]"><span className={row.status === "connected" ? "text-emerald-700" : "text-red-700"}>{row.status}</span><span className="text-[#918B83]">{row.rowCount || 0} rows</span></div></div>)}</div></section>
          </>
        ) : null}

        {data && mode === "wallet" ? <section className="rounded-[22px] border border-black/[0.075] bg-white p-5"><div className="flex items-center gap-2"><WalletCards size={16} className="text-[#A37849]" /><h2 className="text-[18px] font-semibold">Wallet position</h2></div><p className="mt-1 text-[10px] text-[#817D76]">Balances remain separated by currency; Services never invents a cross-currency total.</p><div className="mt-4"><CurrencyRows rows={walletRows} fields={[["available_balance", "Available"], ["reserved_balance", "Reserved"]]} /></div></section> : null}

        {data && mode === "services" ? <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white"><div className="border-b border-black/[0.06] p-4"><h2 className="text-[18px] font-semibold">Connected services</h2><p className="mt-1 text-[10px] text-[#817D76]">Authorization, billing, health, budget and provider routing state.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[10px]"><thead className="bg-[#FAF9F7] text-[9px] uppercase tracking-[0.12em] text-[#817D76]"><tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Health</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3">Requests</th><th className="px-4 py-3">Failures</th><th className="px-4 py-3">Last execution</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{services.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium">{row.service_id || row.id}</td><td className="px-4 py-3">{row.status || "—"}</td><td className="px-4 py-3">{row.health || "—"}</td><td className="px-4 py-3">{row.billing_enabled ? "Enabled" : "Disabled"}</td><td className="px-4 py-3 tabular-nums">{number(row.total_requests).toLocaleString()}</td><td className="px-4 py-3 tabular-nums">{number(row.total_failures).toLocaleString()}</td><td className="px-4 py-3">{time(row.last_execution_at)}</td></tr>)}</tbody></table></div></section> : null}

        {data && mode === "usage" ? <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white"><div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-[18px] font-semibold">Service usage</h2><p className="mt-1 text-[10px] text-[#817D76]">Latest governed usage evidence from the last 30 days.</p></div><label className="relative"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider, capability, status" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[10px] outline-none sm:w-64" /></label></div><div className="p-4"><CurrencyRows rows={usageRows} fields={[["supplier_cost", "Supplier cost"], ["customer_price", "Customer price"]]} /></div><div className="overflow-x-auto border-t border-black/[0.06]"><table className="w-full min-w-[1000px] text-left text-[10px]"><thead className="bg-[#FAF9F7] text-[9px] uppercase tracking-[0.12em] text-[#817D76]"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Capability</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Charge</th><th className="px-4 py-3">Billing</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{filteredUsage.map((row) => <tr key={row.id}><td className="px-4 py-3">{time(row.created_at)}</td><td className="px-4 py-3 font-medium">{row.provider || "—"}</td><td className="px-4 py-3">{row.capability || row.operation || "—"}</td><td className="px-4 py-3">{row.execution_status || row.status || "—"}</td><td className="px-4 py-3 tabular-nums">{money(row.supplier_cost, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.customer_price, row.currency)}</td><td className="px-4 py-3">{row.billing_completed ? "Complete" : "Pending"}</td></tr>)}</tbody></table></div></section> : null}

        {data && mode === "billing" ? <section className="rounded-[22px] border border-black/[0.075] bg-white p-5"><div className="flex items-center gap-2"><CreditCard size={16} className="text-[#A37849]" /><h2 className="text-[18px] font-semibold">Billing & reconciliation</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Billing queue" value={metrics.billing?.queue_open || 0} detail="Usage awaiting billing completion" icon={BadgeDollarSign} warning={(metrics.billing?.queue_open || 0) > 0} /><Metric label="Reconciliation" value={metrics.billing?.reconciliation_open || 0} detail="Revenue evidence requiring review" icon={CircleDollarSign} warning={(metrics.billing?.reconciliation_open || 0) > 0} /><Metric label="Finance posting" value={metrics.usage?.unposted || 0} detail="Billed usage not yet finance-posted" icon={Database} warning={(metrics.usage?.unposted || 0) > 0} /></div><div className="mt-5 divide-y divide-black/[0.055]">{billingQueue.map((item) => <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_120px]"><div><div className="text-[11px] font-medium">{item.title}</div><div className="mt-1 text-[9px] text-[#817D76]">{item.detail}</div></div><div className="text-right text-[9px] text-[#817D76]">{item.status}</div></div>)}{!billingQueue.length ? <div className="py-10 text-center text-[11px] text-[#817D76]">No open billing or reconciliation exceptions.</div> : null}</div></section> : null}

        {data && mode === "integrations" ? <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white"><div className="border-b border-black/[0.06] p-4"><div className="flex items-center gap-2"><Cable size={16} className="text-[#A37849]" /><h2 className="text-[18px] font-semibold">Integrations</h2></div><p className="mt-1 text-[10px] text-[#817D76]">Connection, health and sync state from organization integration records.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[10px]"><thead className="bg-[#FAF9F7] text-[9px] uppercase tracking-[0.12em] text-[#817D76]"><tr><th className="px-4 py-3">Integration</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Health</th><th className="px-4 py-3">Last sync / update</th></tr></thead><tbody className="divide-y divide-black/[0.055]">{integrations.map((row) => <tr key={`${row.id}-${row.provider || "provider"}`}><td className="px-4 py-3 font-medium">{row.display_name || row.integration_name || row.provider || "Integration"}</td><td className="px-4 py-3">{row.provider || "—"}</td><td className="px-4 py-3">{row.status || row.connection_status || "—"}</td><td className="px-4 py-3">{row.health_status || "—"}</td><td className="px-4 py-3">{time(row.last_sync_at || row.updated_at)}</td></tr>)}</tbody></table></div></section> : null}
      </div>
    </main>
  );
}
