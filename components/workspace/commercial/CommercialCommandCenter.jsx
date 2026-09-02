"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CircleDollarSign,
  MessageSquareText,
  RefreshCw,
  ShoppingCart,
  Star,
  Users,
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

function workspaceHref(organizationId, path) {
  if (!path) return "#";
  if (path.startsWith("/workspace/")) return path;
  return `/workspace/${encodeURIComponent(organizationId)}${path.startsWith("/") ? path : `/${path}`}`;
}

function money(value, currency) {
  const amount = Number(value || 0);
  try {
    if (currency) {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    }
  } catch {}
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(amount);
}

function MetricCard({ icon: Icon, label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8E8A82]">
          {label}
        </div>
        <Icon size={15} className="text-[#A37849]" />
      </div>
      <div className={`mt-3 text-[27px] font-medium tracking-[-0.04em] ${attention && Number(value) > 0 ? "text-[#9A533D]" : "text-[#1A1917]"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] leading-5 text-[#9A968E]">
        {detail}
      </div>
    </div>
  );
}

function PriorityPill({ priority }) {
  const attention = priority === "attention";
  return (
    <span className={attention
      ? "rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#9A533D]"
      : "rounded-full border border-[#C0A070]/20 bg-[#C0A070]/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-[#8B693E]"}
    >
      {attention ? "Attention" : "Review"}
    </span>
  );
}

export default function CommercialCommandCenter({ organizationId: organizationIdProp }) {
  const businessContext = useBusinessContext() || {};
  const organizationId = text(
    organizationIdProp || businessContext.organization_id || businessContext.organization?.id,
  );
  const entityId = text(businessContext.entity_id || businessContext.entity?.id);
  const periodId = text(businessContext.period_id || businessContext.period?.id);
  const currency = businessContext.currency || businessContext.entity?.currency_code || businessContext.organization?.currency_code || null;
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

      const response = await fetch(`/api/workspace/commercial/command-center?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Unable to load Commercial workspace");
      }
      setState({ loading: false, error: null, data: result });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Unable to load Commercial workspace",
      }));
    }
  }, [entityId, organizationId, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => load({ silent: true });
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  const metrics = state.data?.metrics || {};
  const queue = Array.isArray(state.data?.queue) ? state.data.queue : [];
  const flow = Array.isArray(state.data?.flow) ? state.data.flow : [];
  const resolvedCurrency = state.data?.context?.currency || currency;

  const primaryActions = useMemo(() => [
    { label: "New quotation", route: "/commercial/sales/quotes" },
    { label: "New sales order", route: "/commercial/sales/orders" },
    { label: "Customers", route: "/commercial/customers" },
  ], []);

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-6 text-[#191919] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1640px]">
        <header className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.055)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">
                Commercial · Revenue
              </div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em] text-[#1B1A18] md:text-[36px]">
                Revenue Command Center
              </h1>
              <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-[#6F6B64]">
                Focus the commercial team on the next action: customer conversations, quotations, orders, fulfillment, reputation and revenue handoff.
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

          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.07] pt-5">
            {primaryActions.map((action, index) => (
              <Link
                key={action.label}
                href={workspaceHref(organizationId, action.route)}
                className={index === 0
                  ? "inline-flex items-center gap-2 rounded-xl bg-[#1D1B18] px-4 py-2.5 text-[12px] font-medium text-white transition hover:bg-black"
                  : "inline-flex items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-4 py-2.5 text-[12px] font-medium text-[#4E4A44] transition hover:border-[#D6A66A]/45 hover:text-[#8D6338]"}
              >
                {action.label}
                <ArrowRight size={13} />
              </Link>
            ))}
          </div>
        </header>

        {state.error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#B36B52]/20 bg-[#B36B52]/[0.06] px-4 py-3 text-[12px] text-[#8B4937]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Commercial data could not be loaded.</div>
              <div className="mt-1 opacity-80">{state.error}</div>
            </div>
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            icon={Users}
            label="Customers"
            value={state.loading ? "…" : Number(metrics.customers?.active || 0)}
            detail={`${Number(metrics.customers?.unread_conversations || 0)} unread customer messages`}
            attention={Number(metrics.customers?.unread_conversations || 0) > 0}
          />
          <MetricCard
            icon={BadgeDollarSign}
            label="Open quotes"
            value={state.loading ? "…" : Number(metrics.quotations?.open || 0)}
            detail={`${money(metrics.quotations?.value || 0, resolvedCurrency)} · ${Number(metrics.quotations?.accepted_to_convert || 0)} ready to convert`}
          />
          <MetricCard
            icon={ShoppingCart}
            label="Open orders"
            value={state.loading ? "…" : Number(metrics.orders?.open || 0)}
            detail={`${money(metrics.orders?.value || 0, resolvedCurrency)} · ${Number(metrics.orders?.fulfillment_pending || 0)} fulfillment pending`}
          />
          <MetricCard
            icon={Star}
            label="Reviews"
            value={state.loading ? "…" : Number(metrics.reputation?.pending_responses || 0)}
            detail={`${Number(metrics.reputation?.low_rating_pending || 0)} low-rating responses need attention`}
            attention
          />
          <MetricCard
            icon={MessageSquareText}
            label="Marketing"
            value={state.loading ? "…" : Number(metrics.marketing?.active || 0)}
            detail={`${Number(metrics.marketing?.publishing_errors || 0)} publishing errors`}
            attention={Number(metrics.marketing?.publishing_errors || 0) > 0}
          />
          <MetricCard
            icon={CircleDollarSign}
            label="Outstanding"
            value={state.loading ? "…" : money(metrics.revenue_handoff?.outstanding_amount || 0, resolvedCurrency)}
            detail={`${Number(metrics.revenue_handoff?.outstanding_invoices || 0)} invoices · ${Number(metrics.revenue_handoff?.overdue_invoices || 0)} overdue`}
            attention={Number(metrics.revenue_handoff?.overdue_invoices || 0) > 0}
          />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.07] pb-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                  Prioritized work
                </div>
                <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">
                  What should move next
                </h2>
              </div>
              <div className="text-[10px] text-[#AAA69E]">Real commercial state</div>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {!state.loading && queue.length === 0 ? (
                <div className="flex items-center gap-3 py-8 text-[12px] text-[#77736C]">
                  <CheckCircle2 size={16} className="text-[#718167]" />
                  No commercial exceptions need attention right now.
                </div>
              ) : null}

              {queue.map((item) => (
                <Link
                  key={item.id}
                  href={workspaceHref(organizationId, item.href)}
                  className="group grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-[#292723] group-hover:text-[#8D6338]">
                        {item.title}
                      </div>
                      <PriorityPill priority={item.priority} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#9A968E]">
                      <span>{titleCase(item.kind)}</span>
                      {item.detail ? <span>{item.detail}</span> : null}
                      {item.status ? <span>{titleCase(item.status)}</span> : null}
                    </div>
                  </div>
                  <ArrowRight size={13} className="hidden text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#B2814E] sm:block" />
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
            <div className="border-b border-black/[0.07] pb-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">
                Revenue lifecycle
              </div>
              <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1C1B19]">
                Customer to cash
              </h2>
            </div>

            <div className="mt-2 divide-y divide-black/[0.06]">
              {flow.map((stage, index) => (
                <Link
                  key={stage.id}
                  href={workspaceHref(organizationId, stage.href)}
                  className="flex items-center gap-3 py-3.5 transition hover:bg-[#FBFAF8]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-[#FBFAF8] text-[11px] font-medium text-[#77736C]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-medium text-[#35322E]">{stage.label}</div>
                      <div className="text-[16px] font-medium text-[#1F1D1A]">{state.loading ? "…" : Number(stage.count || 0)}</div>
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
            <div className="text-[10px] font-medium uppercase tracking-[0.17em] text-[#8D8982]">Workspaces</div>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.02em] text-[#1C1B19]">
              Specialist commercial tools
            </h2>
          </div>

          <div className="mt-2 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Customers", "/commercial/customers", "Profiles, relationships and account context"],
              ["Quotations", "/commercial/sales/quotes", "Prepare, send, accept and convert"],
              ["Sales Orders", "/commercial/sales/orders", "Confirm customer commitments and fulfillment"],
              ["Communications", "/commercial/customers/communications", "Customer conversations across channels"],
              ["Marketing", "/commercial/marketing", "Campaign planning, publishing and performance"],
              ["Reviews", "/commercial/reviews", "Reputation and response management"],
              ["Creative", "/commercial/design", "Campaign and production studio"],
              ["Customer invoices", "/finance/customer-invoices", "Finance handoff and collection"],
            ].map(([label, route, description]) => (
              <Link
                key={label}
                href={workspaceHref(organizationId, route)}
                className="group flex items-center justify-between gap-4 border-b border-black/[0.06] py-3.5"
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-[#35322E] group-hover:text-[#8D6338]">{label}</div>
                  <div className="mt-1 truncate text-[10px] text-[#9A968E]">{description}</div>
                </div>
                <ArrowRight size={12} className="shrink-0 text-[#B7B3AB] group-hover:text-[#B2814E]" />
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-5 rounded-2xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] px-4 py-3 text-[11px] leading-5 text-[#6F604F]">
          Opportunities and forecasting are intentionally not simulated here. Avantiqo will expose them when a governed opportunity lifecycle is active; today this workspace prioritizes real customer, quotation, order, fulfillment, reputation and revenue data.
        </div>
      </div>
    </main>
  );
}
