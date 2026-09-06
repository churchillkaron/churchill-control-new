"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
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

function lifecycleTone(priority) {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
  if (priority === "watch") return "border-yellow-200 bg-yellow-50 text-yellow-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

async function requestLifecycle() {
  const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
  const response = await fetch(`/api/platform/admin/customer-lifecycle?organizationId=${scope}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "Customer lifecycle evidence is unavailable");
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

export default function PlatformCustomerLifecyclePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const next = await requestLifecycle();
      setData(next);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Customer lifecycle evidence is unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const attention = Array.isArray(data?.attention) ? data.attention : [];
  const serviceOnlyContexts = Array.isArray(data?.serviceOnlyContexts) ? data.serviceOnlyContexts : [];
  const lifecycleCounts = data?.lifecycleCounts || {};
  const evidence = data?.evidence || {};

  const actionAccounts = useMemo(
    () => attention.filter((account) => ["critical", "high"].includes(account?.lifecycle?.priority)),
    [attention],
  );

  const state = actionAccounts.some((account) => account?.lifecycle?.priority === "critical")
    ? { label: "Owner intervention required", priority: "critical" }
    : actionAccounts.length
      ? { label: "Retention attention required", priority: "high" }
      : { label: "No urgent retention signal", priority: "observe" };

  const askPartner = useCallback(() => {
    const accountEvidence = actionAccounts.slice(0, 6).map((account) => (
      `${account.organizationName}: ${account.lifecycle?.label}; ${account.lifecycle?.reason}`
    )).join(" | ");

    dispatchPartnerMessage([
      "Review Avantiqo Platform customer lifecycle and retention evidence.",
      `Human-linked customer accounts: ${numeric(summary.humanLinkedAccounts)}.`,
      `Accounts with any successful metered service use: ${numeric(summary.humanAccountsWithAnySuccessfulUse)}.`,
      `Accounts with successful use in the last 7 days: ${numeric(summary.humanAccountsWithSuccessfulUse7d)}.`,
      `Accounts needing owner action: ${numeric(summary.humanAccountsNeedingOwnerAction)}.`,
      `Median time to first successful metered use: ${summary.medianDaysToFirstSuccessfulUse ?? "not proven"} days.`,
      accountEvidence ? `Priority evidence: ${accountEvidence}.` : "No current high-priority customer lifecycle evidence.",
      "Separate onboarding failure, platform execution failure, fading adoption and real dormancy. Do not invent churn probability, renewal probability, or composite health scores. Recommend the next owner action for each priority account.",
    ].join(" "));
  }, [actionAccounts, summary]);

  if (loading && !data) {
    return (
      <section data-avantiqo-platform-customer-lifecycle="true" className="bg-[#F4F3EF] px-4 pb-5 md:px-5">
        <div className="mx-auto flex max-w-[1680px] items-center gap-2 rounded-[22px] border border-black/[0.07] bg-white px-4 py-5 text-[10px] text-[#817B73]">
          <RefreshCw size={13} className="animate-spin" />
          Reading customer lifecycle evidence…
        </div>
      </section>
    );
  }

  return (
    <section data-avantiqo-platform-customer-lifecycle="true" className="bg-[#F4F3EF] px-4 pb-6 md:px-5">
      <div className="mx-auto max-w-[1680px] overflow-hidden rounded-[22px] border border-black/[0.07] bg-white shadow-none">
        <div className="flex flex-col gap-4 border-b border-black/[0.06] px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8D877E]">
                <UsersRound size={12} />
                Customer lifecycle & retention
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.09em] ${lifecycleTone(state.priority)}`}>
                {state.label}
              </span>
            </div>
            <h2 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-[#403C37]">
              Retention begins with first value, then repeat success.
            </h2>
            <p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#918B83]">
              Human-linked accounts are separated from service-only contexts. Lifecycle states come from first success, recent successful use, execution failures and usage decline—not a synthetic customer-health score.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.07] bg-[#FBFAF8] px-2.5 py-2 text-[8px] text-[#858078]">
              <Clock3 size={10} />
              Observed {relativeTime(data?.observedAt)}
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
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {error}. Existing lifecycle values remain visible but are not treated as freshly verified.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-px bg-black/[0.06] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Human-linked accounts", summary.humanLinkedAccounts, `${formatInteger(summary.registeredNonPlatformOrganizations)} registered non-platform organizations`],
            ["First value proven", summary.humanAccountsWithAnySuccessfulUse, "Human-linked accounts with at least one successful metered service use"],
            ["Successful in 7d", summary.humanAccountsWithSuccessfulUse7d, "Repeat success is treated separately from configuration and failed attempts"],
            ["Need owner action", summary.humanAccountsNeedingOwnerAction, "High or critical evidence only; no predicted churn probability"],
          ].map(([label, value, detail]) => (
            <div key={label} className="bg-white px-4 py-4">
              <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#98928A]">{label}</div>
              <div className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-[#3D3934]">{formatInteger(value)}</div>
              <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{detail}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="border-b border-black/[0.06] px-4 py-4 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">Owner attention</div>
                <div className="mt-1 text-[13px] font-semibold text-[#48433D]">Accounts where evidence says act</div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[8px] font-medium ${lifecycleTone(actionAccounts.some((account) => account?.lifecycle?.priority === "critical") ? "critical" : actionAccounts.length ? "high" : "observe")}`}>
                {actionAccounts.length} priority account{actionAccounts.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-3 divide-y divide-black/[0.055]">
              {attention.length ? attention.slice(0, 9).map((account) => (
                <div key={account.organizationId} className="grid gap-2 py-3 md:grid-cols-[minmax(180px,0.45fr)_minmax(0,1fr)_auto] md:gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-medium text-[#46413B]">{account.organizationName}</div>
                    <div className="mt-0.5 text-[8px] text-[#AAA39A]">
                      {formatInteger(account.activeHumanUsers)} active user{numeric(account.activeHumanUsers) === 1 ? "" : "s"} · {formatInteger(account.activeServices)} active services
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold ${lifecycleTone(account.lifecycle?.priority)}`}>
                        {account.lifecycle?.label || "Unknown"}
                      </span>
                      <span className="text-[8px] text-[#AAA39A]">
                        Last success {relativeTime(account.lastSuccessAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-[8px] leading-4 text-[#837D75]">{account.lifecycle?.reason}</div>
                    <div className="mt-1 text-[8px] font-medium leading-4 text-[#6B6258]">Next: {account.lifecycle?.action}</div>
                  </div>
                  <div className="text-right text-[8px] leading-4 text-[#99938B]">
                    <div>{formatInteger(account.success7d)} success / 7d</div>
                    <div>{formatInteger(account.failed7d)} failed / 7d</div>
                  </div>
                </div>
              )) : (
                <div className="flex items-center gap-2 py-4 text-[9px] text-emerald-700">
                  <CheckCircle2 size={12} />
                  No human-linked customer accounts are currently available for lifecycle classification.
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#8D877E]">
              <Sparkles size={11} />
              Lifecycle truth
            </div>

            <div className="mt-3 space-y-2">
              {[
                ["Onboarding", lifecycleCounts.onboarding, "Human access + services, but first successful use not yet proven."],
                ["First success missing", lifecycleCounts.value_unproven, "Older human-linked accounts that still have no successful metered use."],
                ["Platform blocked", lifecycleCounts.platform_blocked, "Execution failures currently dominate successful delivery."],
                ["Fading / stalled", numeric(lifecycleCounts.fading) + numeric(lifecycleCounts.early_adoption_stalled), "Recent or earlier success exists, but repeat successful use has weakened."],
                ["Recent successful use", lifecycleCounts.active_use, "At least one successful metered service execution within the last 7 days."],
              ].map(([label, count, detail]) => (
                <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-medium text-[#514B44]">{label}</span>
                    <span className="text-[9px] font-semibold text-[#403B35]">{formatInteger(count)}</span>
                  </div>
                  <div className="mt-1 text-[8px] leading-4 text-[#99938B]">{detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-[#A78158]/15 bg-[#FBF7F1] px-3 py-3">
              <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.11em] text-[#8A643C]">
                <ShieldCheck size={10} />
                Evidence discipline
              </div>
              <div className="mt-1.5 text-[8px] leading-4 text-[#81766A]">
                {formatInteger(summary.serviceOnlyContexts)} service-only context{numeric(summary.serviceOnlyContexts) === 1 ? " is" : "s are"} excluded from retention rollups. {formatInteger(summary.unverifiedContexts)} organization context{numeric(summary.unverifiedContexts) === 1 ? " has" : "s have"} no active-human or successful-use evidence. Churn probability: not claimed. Renewal prediction: not claimed. Composite health score: not claimed.
              </div>
              <div className="mt-2 text-[8px] leading-4 text-[#81766A]">
                Median time to first successful metered use: {summary.medianDaysToFirstSuccessfulUse === null || summary.medianDaysToFirstSuccessfulUse === undefined ? "not proven" : `${formatInteger(summary.medianDaysToFirstSuccessfulUse)} days`}.
              </div>
              {!evidence.recentUsageComplete ? (
                <div className="mt-2 flex items-start gap-2 text-[8px] leading-4 text-amber-800">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                  Recent usage evidence is incomplete, so lifecycle conclusions are downgraded until the read is complete.
                </div>
              ) : null}
            </div>

            {serviceOnlyContexts.length ? (
              <div className="mt-3">
                <div className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#98928A]">Service-only contexts</div>
                <div className="mt-2 space-y-1.5">
                  {serviceOnlyContexts.slice(0, 4).map((context) => (
                    <div key={context.organizationId} className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.05] px-2.5 py-2 text-[8px]">
                      <span className="truncate text-[#6F6961]">{context.organizationName}</span>
                      <span className="shrink-0 text-[#AAA39A]">Not counted as customer retention</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
