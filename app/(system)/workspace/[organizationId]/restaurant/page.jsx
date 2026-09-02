"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

const EMPTY_METRICS = {
  revenue: 0,
  totalOrders: 0,
  openOrders: 0,
  paidOrders: 0,
  averageOrder: 0,
  occupiedTables: 0,
  totalTables: 0,
  operationsQueue: 0,
  readyOrders: 0,
  activeStaff: 0,
  lowStockAlerts: 0,
  pendingPayables: 0,
  workCenters: 0,
};

function formatAmount(value, currencyCode) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currencyCode
        ? { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }
        : { maximumFractionDigits: 2 },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">{label}</div>
      <div className="mt-3 text-[27px] font-medium tracking-[-0.04em] text-[#1A1917]">{value}</div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">{detail}</div>
    </div>
  );
}

export default function RestaurantWorkspacePage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = params?.organizationId || businessContext.organization_id || organization?.id || "";
  const currencyCode =
    businessContext.entity?.currency ||
    businessContext.entity?.currency_code ||
    organization?.currency_code ||
    organization?.currency ||
    businessContext.currency ||
    null;

  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [sourceHealth, setSourceHealth] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (!organizationId) return;
      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({
          organizationId,
          organizationType: organization?.organization_type || organization?.type || "restaurant",
        });
        const response = await fetch(`/api/workspace/command-center?${query.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
          throw new Error(result.error || "Unable to load restaurant operations.");
        }
        if (cancelled) return;
        setMetrics({ ...EMPTY_METRICS, ...(result.metrics || {}) });
        setSourceHealth(result.sourceHealth || {});
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Unable to load restaurant operations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWorkspace();
    return () => { cancelled = true; };
  }, [organizationId, organization?.organization_type, organization?.type, version]);

  const serviceFlow = useMemo(() => [
    {
      id: "pos",
      title: "Floor service & POS",
      value: metrics.openOrders,
      detail: `${metrics.occupiedTables}/${metrics.totalTables} tables occupied`,
      href: `/workspace/${organizationId}/operations/pos`,
      action: "Open live service",
    },
    {
      id: "kitchen",
      title: "Kitchen production",
      value: metrics.operationsQueue,
      detail: "Preparation work waiting or in progress",
      href: `/workspace/${organizationId}/operations/kitchen`,
      action: "Open kitchen",
    },
    {
      id: "expo",
      title: "Expo & handoff",
      value: metrics.readyOrders,
      detail: "Orders ready for service collection",
      href: `/workspace/${organizationId}/operations/kitchen/expo`,
      action: "Open expo",
    },
    {
      id: "stock",
      title: "Stock & recipes",
      value: metrics.lowStockAlerts,
      detail: "Inventory alerts affecting service readiness",
      href: `/workspace/${organizationId}/supply-chain/production/recipes`,
      action: "Open production stock",
    },
  ], [metrics, organizationId]);

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Restaurant Operations</div>
              <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">Live Service Command</h1>
              <p className="mt-2.5 text-[13px] leading-6 text-[#6F6B64]">
                {organization?.name || "Organization"} · Run floor service, ordering, kitchen production, handoff and settlement from one operating flow.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVersion((current) => current + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] text-[#5E5A54] hover:border-[#D6A66A]/45 hover:text-[#8D6338]"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.07] pt-5">
            <Link href={`/workspace/${organizationId}/operations/pos`} className="inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[12px] font-medium text-white">
              Open POS & Floor Service <ArrowRight size={13} />
            </Link>
            <Link href={`/workspace/${organizationId}/operations/kitchen`} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44]">
              Kitchen
            </Link>
            <Link href={`/workspace/${organizationId}/operations/tables`} className="inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44]">
              Tables
            </Link>
          </div>
        </header>

        {error ? (
          <div className="mt-4 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">{error}</div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Revenue today" value={loading ? "…" : formatAmount(metrics.revenue, currencyCode)} detail="Completed service revenue" />
          <Metric label="Orders today" value={loading ? "…" : metrics.totalOrders} detail="Orders created today" />
          <Metric label="Open orders" value={loading ? "…" : metrics.openOrders} detail="Checks still in service" />
          <Metric label="Average ticket" value={loading ? "…" : formatAmount(metrics.averageOrder, currencyCode)} detail="Average order value" />
          <Metric label="Kitchen queue" value={loading ? "…" : metrics.operationsQueue} detail="Preparation work in flow" />
          <Metric label="Ready" value={loading ? "…" : metrics.readyOrders} detail="Orders awaiting handoff" />
        </section>

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="border-b border-black/[0.07] pb-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Live workflow</div>
            <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">Service from table to handoff</h2>
          </div>

          <div className="grid gap-x-5 md:grid-cols-2 xl:grid-cols-4">
            {serviceFlow.map((item, index) => (
              <Link key={item.id} href={item.href} className="group border-b border-black/[0.06] py-4 xl:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-[#FBFAF8] text-[11px] font-medium text-[#77736C]">{index + 1}</div>
                  <div className="text-[22px] font-medium tracking-[-0.03em] text-[#1B1A18]">{loading ? "…" : item.value}</div>
                </div>
                <div className="mt-4 text-[13px] font-medium text-[#312F2B] group-hover:text-[#8D6338]">{item.title}</div>
                <div className="mt-1 text-[11px] leading-5 text-[#96928A]">{item.detail}</div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium text-[#A37849]">{item.action} <ArrowRight size={11} /></div>
              </Link>
            ))}
          </div>
        </section>

        {Object.keys(sourceHealth).length ? (
          <section className="mt-5 rounded-2xl border border-black/[0.075] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(sourceHealth).map(([source, healthy]) => (
                <span key={source} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-[#FBFAF8] px-2.5 py-1 text-[9px] text-[#77736C]">
                  <CheckCircle2 size={10} className={healthy ? "text-[#718167]" : "text-[#A46A4F]"} />
                  {source}: {healthy ? "connected" : "unavailable"}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
