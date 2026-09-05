"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  RefreshCw,
  Rocket,
  ServerCog,
  TriangleAlert,
} from "lucide-react";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric(value));
}

function formatMoneyMap(values) {
  const entries = Object.entries(values || {});
  if (!entries.length) return "No recorded value";
  return entries
    .map(([currency, value]) => `${currency} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numeric(value))}`)
    .join(" · ");
}

function relativeTime(value) {
  if (!value) return "No evidence";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "No evidence";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function deltaLabel(current, previous) {
  const next = numeric(current);
  const prior = numeric(previous);
  if (!prior && !next) return "No movement";
  if (!prior && next) return `+${formatInteger(next)} from zero`;
  const delta = next - prior;
  const percent = (delta / Math.abs(prior)) * 100;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${formatInteger(delta)} (${prefix}${percent.toFixed(1)}%)`;
}

function successRate(row) {
  const attempts = numeric(row?.attempts);
  if (!attempts) return null;
  return (numeric(row?.successful) / attempts) * 100;
}

async function requestGrowth() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/growth?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Growth evidence is unavailable");
  }
  return payload;
}

function dispatchPartnerMessage(message) {
  window.dispatchEvent(
    new CustomEvent("avantiqo:home-command", {
      detail: { message, source: "text" },
    }),
  );
  window.requestAnimationFrame(() => {
    document.querySelector('[data-avantiqo-home-intelligence="true"]')?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
}

export default function PlatformGrowthTrajectoryPanel() {
  const [growth, setGrowth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await requestGrowth();
      setGrowth(next);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Growth evidence is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const customers = growth?.customers || {};
  const current7d = growth?.execution?.current7d || {};
  const previous7d = growth?.execution?.previous7d || {};
  const adoption = growth?.adoption || {};
  const currentUsage = growth?.economics?.successfulUsage?.current30d || {};
  const previousUsage = growth?.economics?.successfulUsage?.previous30d || {};
  const currentInvoices = growth?.economics?.invoices?.current30d || {};
  const previousInvoices = growth?.economics?.invoices?.previous30d || {};
  const momentum = Array.isArray(growth?.customerMomentum) ? growth.customerMomentum : [];
  const newCustomers = Array.isArray(customers.latestNewCustomers) ? customers.latestNewCustomers : [];

  const currentSuccessRate = successRate(current7d);
  const previousSuccessRate = successRate(previous7d);

  const demandState = numeric(current7d.failed) > numeric(current7d.successful)
    ? { label: "Demand dominated by failures", tone: "blocked" }
    : numeric(current7d.successful) > numeric(previous7d.successful)
      ? { label: "Successful usage expanding", tone: "positive" }
      : { label: "Trajectory needs review", tone: "review" };

  const summaryCards = useMemo(() => [
    {
      label: "Customer base",
      value: `${formatInteger(customers.activeRegistered)}/${formatInteger(customers.total)} active`,
      detail: `${formatInteger(customers.new30d)} added in 30d · prior 30d ${formatInteger(customers.newPrevious30d)}`,
      icon: Building2,
    },
    {
      label: "Successful customers",
      value: `${formatInteger(customers.successfulUsage30d)} in 30d`,
      detail: `Prior 30d ${formatInteger(customers.successfulUsagePrevious30d)} · metered successful usage only`,
      icon: CheckCircle2,
    },
    {
      label: "Successful usage",
      value: formatInteger(currentUsage.successfulEvents),
      detail: `${deltaLabel(currentUsage.successfulEvents, previousUsage.successfulEvents)} vs prior 30d`,
      icon: Gauge,
    },
    {
      label: "Service activations",
      value: formatInteger(adoption.serviceActivations30d),
      detail: `${deltaLabel(adoption.serviceActivations30d, adoption.serviceActivationsPrevious30d)} vs prior 30d`,
      icon: ServerCog,
    },
  ], [adoption, currentUsage.successfulEvents, customers, previousUsage.successfulEvents]);

  const askPartner = useCallback(() => {
    dispatchPartnerMessage([
      "Review Avantiqo Platform growth and customer trajectory using current authoritative evidence.",
      `Registered customer organizations: ${numeric(customers.total)}; active registered: ${numeric(customers.activeRegistered)}.`,
      `New customers in current 30d: ${numeric(customers.new30d)}; prior 30d: ${numeric(customers.newPrevious30d)}.`,
      `Customers with successful metered usage in current 30d: ${numeric(customers.successfulUsage30d)}; prior 30d: ${numeric(customers.successfulUsagePrevious30d)}.`,
      `Current 7d service attempts: ${numeric(current7d.attempts)}; successful: ${numeric(current7d.successful)}; failed: ${numeric(current7d.failed)}.`,
      `Previous 7d service attempts: ${numeric(previous7d.attempts)}; successful: ${numeric(previous7d.successful)}; failed: ${numeric(previous7d.failed)}.`,
      `Current 30d successful usage customer value: ${formatMoneyMap(currentUsage.customerValueByCurrency)}.`,
      `Current 30d successful usage contribution: ${formatMoneyMap(currentUsage.contributionByCurrency)}.`,
      "Separate real customer growth, healthy adoption, failed demand, and monetization. Do not call failed attempts engagement, do not invent MRR, and do not combine currencies without an authoritative conversion policy. Recommend the highest-leverage owner action.",
    ].join(" "));
  }, [current7d, currentUsage, customers, previous7d]);

  if (loading && !growth) {
    return (
      <section data-avantiqo-platform-growth="true" className="bg-[#F4F3EF] px-4 pb-5 md:px-5">
        <div className="mx-auto flex max-w-[1680px] items-center gap-2 rounded-[22px] border border-black/[0.07] bg-white px-4 py-5 text-[10px] text-[#817B73]">
          <RefreshCw size={13} className="animate-spin" />
          Reading platform growth evidence…
        </div>
      </section>
    );
  }

  const stateClasses = demandState.tone === "blocked"
    ? "border-red-200 bg-red-50 text-red-800"
    : demandState.tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section data-avantiqo-platform-growth="true" className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-none">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]">
                <Rocket size={12} />
                Growth & trajectory
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.09em] ${stateClasses}`}>
                {demandState.label}
              </span>
            </div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">
              Growth means customers succeeding, not traffic increasing.
            </h2>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#918B83]">
              Customer acquisition, successful service adoption, failed demand and monetization are kept separate. No synthetic MRR, no failed-attempt engagement, and no silent currency conversion.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.07] bg-[#FBFAF8] px-2.5 py-2 text-[8px] text-[#858078]">
              <Clock3 size={10} />
              Observed {relativeTime(growth?.observedAt)}
            </span>
            <button
              type="button"
              onClick={() => load({ quiet: true })}
              disabled={refreshing}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-medium text-[#625D55] hover:border-[#B98A57]/35 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={askPartner}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 text-[8px] font-medium text-[#8A643C] hover:border-[#B98A57]/45"
            >
              Review with Partner
              <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-[9px] leading-4 text-amber-900">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            {error}. Existing values remain visible but are not treated as freshly verified.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-px bg-black/[0.06] sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#98928A]">{card.label}</div>
                  <Icon size={12} className="text-[#A78158]" />
                </div>
                <div className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-[#3D3934]">{card.value}</div>
                <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{card.detail}</div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <div className="border-b border-black/[0.06] px-4 py-4 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">Execution quality</div>
                <div className="mt-1 text-[13px] font-semibold text-[#48433D]">Demand versus successful delivery</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[8px] font-medium ${numeric(current7d.failed) > numeric(current7d.successful) ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {currentSuccessRate === null ? "No attempts" : `${currentSuccessRate.toFixed(1)}% success`}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Attempts 7d", current7d.attempts, previous7d.attempts],
                ["Successful 7d", current7d.successful, previous7d.successful],
                ["Failed 7d", current7d.failed, previous7d.failed],
                ["Other 7d", current7d.other, previous7d.other],
              ].map(([label, current, previous]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-3">
                  <div className="text-[8px] font-medium uppercase tracking-[0.1em] text-[#99938B]">{label}</div>
                  <div className="mt-1.5 text-[15px] font-semibold text-[#48423C]">{formatInteger(current)}</div>
                  <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{deltaLabel(current, previous)} vs prior 7d</div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-red-200/70 bg-red-50/60 px-3 py-3 text-[8px] leading-4 text-red-800">
              <span className="font-semibold">Owner interpretation:</span> attempted demand is not counted as healthy adoption. Current successful delivery is {currentSuccessRate === null ? "not measurable" : `${currentSuccessRate.toFixed(1)}%`} versus {previousSuccessRate === null ? "no prior evidence" : `${previousSuccessRate.toFixed(1)}%`} in the previous 7-day window.
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">
              <CircleDollarSign size={11} />
              Monetization evidence
            </div>
            <div className="mt-3 space-y-2">
              {[
                ["Successful usage value · 30d", formatMoneyMap(currentUsage.customerValueByCurrency), `Prior 30d ${formatMoneyMap(previousUsage.customerValueByCurrency)}`],
                ["Successful usage contribution · 30d", formatMoneyMap(currentUsage.contributionByCurrency), `Prior 30d ${formatMoneyMap(previousUsage.contributionByCurrency)}`],
                ["Invoice value · 30d", formatMoneyMap(currentInvoices.valueByCurrency), `${formatInteger(currentInvoices.count)} recorded invoices`],
                ["Invoice value · prior 30d", formatMoneyMap(previousInvoices.valueByCurrency), `${formatInteger(previousInvoices.count)} recorded invoices`],
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-2.5">
                  <div className="text-[8px] font-medium uppercase tracking-[0.09em] text-[#99938B]">{label}</div>
                  <div className="mt-1 text-[11px] font-semibold text-[#504A43]">{value}</div>
                  <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[8px] leading-4 text-[#99938B]">
              Currency values remain separate. This panel does not claim MRR, ARR, retention or churn without dedicated contract/subscription evidence.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 border-t border-black/[0.06] lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
          <div className="border-b border-black/[0.06] px-4 py-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">Customer momentum</div>
                <div className="mt-1 text-[13px] font-semibold text-[#48433D]">Where successful usage is actually happening</div>
              </div>
              <span className="text-[8px] text-[#99938B]">Successful metered events only</span>
            </div>

            <div className="mt-3 divide-y divide-black/[0.055]">
              {momentum.length ? momentum.slice(0, 6).map((row) => (
                <div key={row.organizationId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-medium text-[#4B463F]">{row.organizationName}</div>
                    <div className="mt-0.5 text-[8px] text-[#9D978F]">
                      {formatInteger(row.successful7d)} success 7d · {formatInteger(row.successfulPrevious7d)} prior 7d · last {relativeTime(row.latestSuccessAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-semibold text-[#5B554E]">{formatInteger(row.successful30d)}</div>
                    <div className="mt-0.5 text-[8px] text-[#A19A91]">30d success</div>
                  </div>
                </div>
              )) : (
                <div className="py-4 text-[9px] text-[#918B83]">No customer organization has successful metered usage in the current 30-day evidence window.</div>
              )}
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">New customer evidence</div>
            <div className="mt-1 text-[13px] font-semibold text-[#48433D]">Recently added organizations</div>
            <div className="mt-3 divide-y divide-black/[0.055]">
              {newCustomers.length ? newCustomers.map((row) => (
                <div key={row.id} className="py-2.5">
                  <div className="text-[9px] font-medium text-[#4B463F]">{row.name}</div>
                  <div className="mt-0.5 text-[8px] text-[#9D978F]">Added {relativeTime(row.createdAt)}</div>
                </div>
              )) : (
                <div className="py-4 text-[9px] text-[#918B83]">No new customer organizations in the current 30-day window.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
