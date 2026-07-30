"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOrganization } from "@/app/providers/OrganizationProvider";

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

  if (!currencyCode) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(amount);
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

export default function RestaurantWorkspacePage() {
  const params = useParams();
  const { organization } = useOrganization();
  const organizationId =
    params?.organizationId || organization?.id || "";
  const currencyCode =
    organization?.currency_code || organization?.currency || null;

  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [workCenters, setWorkCenters] = useState([]);
  const [sourceHealth, setSourceHealth] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (!organizationId) return;

      setLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({
          organizationId,
          organizationType:
            organization?.organization_type ||
            organization?.type ||
            "restaurant",
        });
        const response = await fetch(
          `/api/workspace/command-center?${query.toString()}`,
          {
            cache: "no-store",
          }
        );
        const result = await response.json();

        if (!response.ok || result.success === false) {
          throw new Error(result.error || "Unable to load restaurant operations.");
        }

        if (cancelled) return;

        setMetrics({
          ...EMPTY_METRICS,
          ...(result.metrics || {}),
        });
        setWorkCenters(result.workCenters || []);
        setSourceHealth(result.sourceHealth || {});
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [organizationId, organization?.organization_type, organization?.type]);

  const operationCards = useMemo(
    () => [
      {
        id: "waiter-pos",
        title: "Waiter POS",
        value: metrics.openOrders,
        label: "Open Orders",
        href: `/workspace/${organizationId}/pos/waiter`,
      },
      {
        id: "tables",
        title: "Floor",
        value: `${metrics.occupiedTables}/${metrics.totalTables}`,
        label: "Occupied Tables",
        href: `/workspace/${organizationId}/operations/service-points`,
      },
      {
        id: "kitchen",
        title: "Kitchen",
        value: metrics.operationsQueue,
        label: "Active Tickets",
        href: `/workspace/${organizationId}/operations/kitchen`,
      },
      {
        id: "expo",
        title: "Expo",
        value: metrics.readyOrders,
        label: "Ready Orders",
        href: `/workspace/${organizationId}/operations/kitchen`,
      },
      {
        id: "payments",
        title: "Payments",
        value: metrics.openOrders,
        label: "Orders Awaiting Payment",
        href: `/workspace/${organizationId}/pos/waiter`,
      },
      {
        id: "inventory",
        title: "Inventory",
        value: metrics.lowStockAlerts,
        label: "Low Stock Alerts",
        href: `/workspace/${organizationId}/supply-chain/inventory`,
      },
      ...workCenters.map((center) => ({
        id: `work-center-${center.id}`,
        title: center.name || center.code || "Work Centre",
        value: metrics.operationsQueue,
        label: "Production Queue",
        href: `/workspace/${organizationId}/operations/work-centres?workCenterId=${encodeURIComponent(center.id)}`,
      })),
    ],
    [metrics, organizationId, workCenters]
  );

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <section className="mb-8 rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(214,166,106,0.22),transparent_35%),linear-gradient(135deg,rgba(20,16,12,0.95),rgba(3,7,18,0.98))] p-8">
        <p className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/80">
          Restaurant Operations
        </p>
        <h1 className="mt-3 text-5xl font-semibold tracking-[-0.04em]">
          Live Service Command
        </h1>
        <p className="mt-3 text-white/50">
          {organization?.name || "Organization"}
        </p>
        {error ? (
          <p className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
      </section>

      <section className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Revenue Today", formatAmount(metrics.revenue, currencyCode)],
          ["Orders Today", metrics.totalOrders],
          ["Open Orders", metrics.openOrders],
          ["Average Ticket", formatAmount(metrics.averageOrder, currencyCode)],
          ["Kitchen Queue", metrics.operationsQueue],
          ["Ready Orders", metrics.readyOrders],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg"
          >
            <p className="text-sm text-white/60">{label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {loading ? "—" : value}
            </p>
          </div>
        ))}
      </section>

      <section className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {operationCards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="flex min-h-40 flex-col justify-between rounded-3xl border border-white/10 bg-black/30 p-6 shadow-lg backdrop-blur-xl transition hover:-translate-y-1 hover:border-[#D6A66A]/40"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#D6A66A]/75">
                {card.title}
              </p>
              <p className="mt-3 text-sm text-white/55">{card.label}</p>
            </div>
            <span className="mt-6 text-3xl font-semibold text-white">
              {loading ? "—" : card.value}
            </span>
          </Link>
        ))}
      </section>

      {Object.keys(sourceHealth).length ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Live source status
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(sourceHealth).map(([source, healthy]) => (
              <span
                key={source}
                className={`rounded-full border px-3 py-1 text-xs ${
                  healthy
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-400/20 bg-amber-400/10 text-amber-100"
                }`}
              >
                {source}: {healthy ? "connected" : "unavailable"}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
