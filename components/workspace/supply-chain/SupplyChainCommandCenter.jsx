"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(
      undefined,
      currency
        ? {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
          }
        : {
            maximumFractionDigits: 2,
          },
    ).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

function absoluteHref(organizationId, href) {
  if (!href) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}${href}`;
}

function MetricCard({ label, value, detail, alert = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">
        {label}
      </div>
      <div className={`mt-3 text-[27px] font-medium tracking-[-0.04em] ${alert && Number(value) > 0 ? "text-[#9A533D]" : "text-[#1A1917]"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">{detail}</div>
    </div>
  );
}

const QUICK_ACTIONS = Object.freeze([
  {
    id: "inventory",
    label: "Inventory position",
    description: "See stock by item, warehouse and location.",
    href: "/supply-chain/inventory/stock-position",
    icon: Boxes,
  },
  {
    id: "replenishment",
    label: "Replenishment",
    description: "Review shortage signals and purchase needs.",
    href: "/supply-chain/inventory/replenishment",
    icon: ClipboardList,
  },
  {
    id: "purchase-orders",
    label: "Purchase orders",
    description: "Approve, monitor and receive purchasing commitments.",
    href: "/supply-chain/procurement/purchase-orders",
    icon: Truck,
  },
  {
    id: "receiving",
    label: "Receiving",
    description: "Receive, inspect and hand inventory into warehouse execution.",
    href: "/supply-chain/procurement/goods-receipts",
    icon: PackageCheck,
  },
  {
    id: "warehouse",
    label: "Warehouse work",
    description: "Assign, start and complete putaway and transfer work.",
    href: "/supply-chain/warehouse/tasks",
    icon: Warehouse,
  },
  {
    id: "counts",
    label: "Stock counts",
    description: "Count, reconcile and control inventory accuracy.",
    href: "/supply-chain/inventory/counts",
    icon: ShieldCheck,
  },
]);

export default function SupplyChainCommandCenter() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organizationId = text(
    params?.organizationId ||
      businessContext.organization_id ||
      businessContext.organization?.id,
  );
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    "All entities";
  const periodName =
    businessContext.period?.name ||
    businessContext.period?.period_name ||
    businessContext.period?.label ||
    null;

  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const query = new URLSearchParams({ organizationId });
      if (entityId) query.set("entityId", entityId);
      if (periodId) query.set("periodId", periodId);

      const response = await fetch(`/api/workspace/supply-chain/command-center?${query.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load Supply Chain");
      }
      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Unable to load Supply Chain",
        data: null,
      });
    }
  }, [entityId, organizationId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const metrics = state.data?.metrics || {};
  const queue = Array.isArray(state.data?.queue) ? state.data.queue : [];
  const flow = Array.isArray(state.data?.flow) ? state.data.flow : [];
  const currency = state.data?.context?.currency || businessContext.currency || null;

  const summary = useMemo(() => ({
    shortage: Number(metrics.inventory?.shortage_items || 0),
    openOrders: Number(metrics.purchasing?.open_orders || 0),
    overdueOrders: Number(metrics.purchasing?.overdue_orders || 0),
    openTasks: Number(metrics.warehouse?.open_tasks || 0),
    unassignedTasks: Number(metrics.warehouse?.unassigned_tasks || 0),
    supplierRisk: Number(metrics.suppliers?.at_risk || 0),
  }), [metrics]);

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">
                Supply Chain
              </div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">
                Supply Chain Control
              </h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                Plan shortages, buy, receive, move and control inventory from one operating workspace. Exceptions come first; master data and specialist analysis stay one click away.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#77736C]">
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">
                {businessContext.organization?.name || "Organization"}
              </span>
              <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">
                {entityName}
              </span>
              {periodName ? (
                <span className="rounded-full border border-black/[0.08] bg-[#FBFAF8] px-3 py-1.5">
                  {periodName}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => load()}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 transition hover:border-[#D6A66A]/45 hover:text-[#8D6338]"
              >
                <RefreshCw size={11} className={state.loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {state.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Supply Chain data could not be loaded.</div>
              <div className="mt-1 opacity-80">{state.error}</div>
            </div>
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Inventory value"
            value={state.loading ? "…" : money(metrics.inventory?.value || 0, currency)}
            detail={`${Number(metrics.inventory?.active_items || 0)} active items`}
          />
          <MetricCard
            label="Shortages"
            value={state.loading ? "…" : summary.shortage}
            detail="Items below control levels or carrying an open alert"
            alert
          />
          <MetricCard
            label="Open POs"
            value={state.loading ? "…" : summary.openOrders}
            detail={`${money(metrics.purchasing?.commitment || 0, currency)} open commitment`}
          />
          <MetricCard
            label="Overdue inbound"
            value={state.loading ? "…" : summary.overdueOrders}
            detail={`${Number(metrics.purchasing?.due_today_orders || 0)} expected today`}
            alert
          />
          <MetricCard
            label="Warehouse work"
            value={state.loading ? "…" : summary.openTasks}
            detail={`${summary.unassignedTasks} unassigned`}
            alert
          />
          <MetricCard
            label="Supplier risk"
            value={state.loading ? "…" : summary.supplierRisk}
            detail={`${Number(metrics.suppliers?.active || 0)} active suppliers`}
            alert
          />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(390px,0.82fr)]">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                  Needs attention
                </div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">
                  Supply exceptions to move now
                </h2>
              </div>
              <div className="text-[10px] text-[#AAA69E]">Live business data</div>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {!state.loading && queue.length === 0 ? (
                <div className="py-8 text-[12px] text-[#77736C]">
                  No active shortage, inbound, warehouse or supplier exceptions in this context.
                </div>
              ) : null}

              {queue.map((item) => (
                <Link
                  key={item.id}
                  href={absoluteHref(organizationId, item.href)}
                  className="group grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-[#292723] group-hover:text-[#8D6338]">
                        {item.title}
                      </div>
                      <span className={item.priority === "attention"
                        ? "rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#9A533D]"
                        : "rounded-full border border-black/[0.08] bg-[#F7F6F3] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#747069]"}
                      >
                        {item.status || "Open"}
                      </span>
                    </div>
                    {item.detail ? (
                      <div className="mt-1 text-[10px] text-[#9A968E]">{item.detail}</div>
                    ) : null}
                  </div>
                  <ArrowRight size={13} className="hidden text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#B2814E] sm:block" />
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.07] pb-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                Supply flow
              </div>
              <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">
                Plan to control
              </h2>
            </div>

            <div className="mt-2 divide-y divide-black/[0.06]">
              {flow.map((stage, index) => (
                <Link
                  key={stage.id}
                  href={absoluteHref(organizationId, stage.href)}
                  className="flex items-center gap-3 py-3.5 transition hover:bg-[#FBFAF8]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-[#FBFAF8] text-[11px] font-medium text-[#77736C]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-medium text-[#35322E]">{stage.label}</div>
                      <div className="text-[16px] font-medium text-[#1F1D1A]">{state.loading ? "…" : stage.count}</div>
                    </div>
                    <div className="mt-0.5 text-[10px] leading-4 text-[#9A968E]">{stage.detail}</div>
                  </div>
                  <ArrowRight size={12} className="text-[#C0BCB4]" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
          <div className="border-b border-black/[0.07] pb-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
              Daily work
            </div>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.02em] text-[#1C1B19]">
              Open the work, not the module catalogue
            </h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.id}
                  href={absoluteHref(organizationId, action.href)}
                  className="group rounded-2xl border border-black/[0.075] bg-[#FBFAF8] p-4 transition hover:border-[#D6A66A]/45 hover:bg-white"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.07] p-2 text-[#9A7045]">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12px] font-medium text-[#34312D] group-hover:text-[#8D6338]">{action.label}</div>
                        <ArrowRight size={12} className="text-[#B7B3AB]" />
                      </div>
                      <div className="mt-1 text-[10px] leading-4 text-[#96928A]">{action.description}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="mt-5 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] px-4 py-3 text-[11px] leading-5 text-[#6F604F]">
          Supply Chain owns inventory, procurement, receiving, warehouse execution, reservations and valuation. Sales demand remains Commercial, production execution remains Operations, workforce remains People, and accounting/posting remains Finance.
        </div>
      </div>
    </main>
  );
}
