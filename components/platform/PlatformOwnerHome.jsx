"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  Layers3,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import AutonomousWatchAlertBridge from "@/components/operator/AutonomousWatchAlertBridge";
import BusinessPartnerCodeMissionPanel from "@/components/operator/BusinessPartnerCodeMissionPanel";
import HomeAvantiqoIntelligenceDock from "@/components/operator/HomeAvantiqoIntelligenceDock";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatValue(value) {
  const number = numeric(value);
  const absolute = Math.abs(number);

  if (absolute >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (absolute >= 10_000) return `${(number / 1_000).toFixed(1)}K`;

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: absolute < 100 ? 2 : 0,
  }).format(number);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(1)}%`;
}

function relativeTime(value) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function severityWeight(value) {
  const severity = normalized(value);
  if (["critical", "fatal", "sev_1", "sev1"].includes(severity)) return 0;
  if (["high", "error", "severe", "sev_2", "sev2"].includes(severity)) return 1;
  if (["medium", "warning", "warn", "sev_3", "sev3"].includes(severity)) return 2;
  if (["low", "minor", "sev_4", "sev4"].includes(severity)) return 3;
  return 4;
}

function severityLabel(value) {
  const severity = normalized(value);
  if (["critical", "fatal", "sev_1", "sev1"].includes(severity)) return "Critical";
  if (["high", "error", "severe", "sev_2", "sev2"].includes(severity)) return "High";
  if (["medium", "warning", "warn", "sev_3", "sev3"].includes(severity)) return "Medium";
  if (["low", "minor", "sev_4", "sev4"].includes(severity)) return "Low";
  return "Info";
}

function severityClasses(value) {
  const weight = severityWeight(value);
  if (weight === 0) return "border-red-200 bg-red-50 text-red-800";
  if (weight === 1) return "border-orange-200 bg-orange-50 text-orange-800";
  if (weight === 2) return "border-amber-200 bg-amber-50 text-amber-800";
  if (weight === 3) return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-black/[0.07] bg-[#F7F6F3] text-[#77726A]";
}

function isOpenSignal(signal) {
  if (signal?.resolved_at) return false;
  const status = normalized(signal?.status || signal?.incident_status);
  return ![
    "closed",
    "complete",
    "completed",
    "dismissed",
    "ignored",
    "resolved",
  ].includes(status);
}

function moduleState(module) {
  const status = normalized(module?.health || module?.status || module?.state);
  if (["degraded", "error", "failed", "unhealthy"].includes(status)) return "degraded";
  if (["disabled", "inactive", "archived"].includes(status)) return "inactive";
  if (["active", "enabled", "healthy", "live", "ready"].includes(status)) return "active";
  return "registered";
}

function moduleStateClasses(state) {
  if (state === "degraded") return "bg-red-500";
  if (state === "inactive") return "bg-[#B8B2A8]";
  if (state === "active") return "bg-emerald-600";
  return "bg-[#B18452]";
}

function serviceState(service) {
  const health = normalized(service?.health);
  const status = normalized(service?.status);

  if (["critical", "degraded", "error", "failed", "unhealthy"].includes(health)) {
    return "degraded";
  }
  if (["disabled", "inactive", "suspended", "archived"].includes(status)) {
    return "inactive";
  }
  if (["healthy", "live", "ok", "operational", "ready"].includes(health)) {
    return "healthy";
  }
  return "unknown";
}

function serviceStateClasses(state) {
  if (state === "degraded") return "border-red-200 bg-red-50 text-red-800";
  if (state === "inactive") return "border-slate-200 bg-slate-50 text-slate-700";
  if (state === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

async function requestJson(path) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Unable to load ${path}`);
  }

  return payload;
}

function signalTitle(signal) {
  return clean(signal?.title || signal?.event_type || signal?.alert_type || signal?.incident_type) || "Platform signal";
}

function signalDetail(signal) {
  return clean(signal?.description || signal?.message || signal?.incident_summary) || "Platform evidence requires review.";
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

export default function PlatformOwnerHome() {
  const [control, setControl] = useState(null);
  const [profit, setProfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);

    const scope = encodeURIComponent(PLATFORM_ORGANIZATION_ID);
    const [controlResult, profitResult] = await Promise.allSettled([
      requestJson(`/api/platform/admin/control?organizationId=${scope}`),
      requestJson(`/api/platform/admin/profit?organizationId=${scope}`),
    ]);

    let nextError = "";

    if (controlResult.status === "fulfilled") {
      setControl(controlResult.value);
    } else {
      nextError = controlResult.reason?.message || "Platform control evidence is unavailable.";
    }

    if (profitResult.status === "fulfilled") {
      setProfit(profitResult.value);
    } else if (!nextError) {
      nextError = profitResult.reason?.message || "Platform economic evidence is unavailable.";
    }

    if (controlResult.status === "fulfilled" || profitResult.status === "fulfilled") {
      setRefreshedAt(new Date());
    }

    setError(nextError);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const organizations = useMemo(
    () => (Array.isArray(control?.organizations) ? control.organizations : []),
    [control],
  );
  const customerOrganizations = useMemo(
    () => organizations.filter((organization) => organization?.id !== PLATFORM_ORGANIZATION_ID),
    [organizations],
  );
  const activity = useMemo(
    () => (Array.isArray(control?.recentActivity) ? control.recentActivity : []),
    [control],
  );
  const modules = useMemo(
    () => (Array.isArray(control?.modules) ? control.modules : []),
    [control],
  );
  const services = useMemo(
    () => (Array.isArray(control?.services) ? control.services : []),
    [control],
  );

  const openSignals = useMemo(
    () => activity
      .filter(isOpenSignal)
      .sort((left, right) => {
        const severity = severityWeight(left?.severity) - severityWeight(right?.severity);
        if (severity !== 0) return severity;
        return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
      }),
    [activity],
  );

  const criticalSignals = useMemo(
    () => openSignals.filter((signal) => severityWeight(signal?.severity) === 0),
    [openSignals],
  );
  const highSignals = useMemo(
    () => openSignals.filter((signal) => severityWeight(signal?.severity) === 1),
    [openSignals],
  );

  const organizationNames = useMemo(
    () => new Map(organizations.map((organization) => [organization?.id, organization?.name || "Organization"])),
    [organizations],
  );

  const organizationSignalCounts = useMemo(() => {
    const counts = new Map();
    for (const signal of openSignals) {
      if (!signal?.organization_id) continue;
      counts.set(signal.organization_id, (counts.get(signal.organization_id) || 0) + 1);
    }
    return counts;
  }, [openSignals]);

  const profitByOrganization = useMemo(
    () => new Map(
      (Array.isArray(profit?.organizations) ? profit.organizations : []).map((row) => [row?.organizationId, row]),
    ),
    [profit],
  );

  const rankedOrganizations = useMemo(
    () => customerOrganizations
      .map((organization) => ({
        ...organization,
        openSignals: organizationSignalCounts.get(organization?.id) || 0,
        economics: profitByOrganization.get(organization?.id) || null,
      }))
      .sort((left, right) => {
        const signalDelta = right.openSignals - left.openSignals;
        if (signalDelta !== 0) return signalDelta;
        return numeric(right?.economics?.revenue) - numeric(left?.economics?.revenue);
      }),
    [customerOrganizations, organizationSignalCounts, profitByOrganization],
  );

  const moduleCounts = useMemo(() => {
    const counts = { active: 0, degraded: 0, inactive: 0, registered: 0 };
    for (const module of modules) counts[moduleState(module)] += 1;
    return counts;
  }, [modules]);

  const rankedModules = useMemo(
    () => [...modules].sort((left, right) => {
      const weights = { degraded: 0, inactive: 1, registered: 2, active: 3 };
      const stateDelta = weights[moduleState(left)] - weights[moduleState(right)];
      if (stateDelta !== 0) return stateDelta;
      return clean(left?.name || left?.module_name || left?.id).localeCompare(clean(right?.name || right?.module_name || right?.id));
    }),
    [modules],
  );

  const serviceCounts = useMemo(() => {
    const counts = { healthy: 0, degraded: 0, inactive: 0, unknown: 0 };
    for (const service of services) counts[serviceState(service)] += 1;
    return counts;
  }, [services]);

  const rankedServices = useMemo(
    () => [...services].sort((left, right) => {
      const weights = { degraded: 0, unknown: 1, inactive: 2, healthy: 3 };
      const stateDelta = weights[serviceState(left)] - weights[serviceState(right)];
      if (stateDelta !== 0) return stateDelta;
      return clean(left?.service_id || left?.id).localeCompare(clean(right?.service_id || right?.id));
    }),
    [services],
  );

  const platformState = criticalSignals.length
    ? { label: "Critical attention", tone: "critical", detail: `${criticalSignals.length} critical signal${criticalSignals.length === 1 ? "" : "s"}` }
    : highSignals.length || serviceCounts.degraded
      ? {
          label: "Needs attention",
          tone: "attention",
          detail: highSignals.length
            ? `${highSignals.length} high-severity signal${highSignals.length === 1 ? "" : "s"}`
            : `${serviceCounts.degraded} degraded service${serviceCounts.degraded === 1 ? "" : "s"}`,
        }
      : openSignals.length
        ? { label: "Review open", tone: "review", detail: `${openSignals.length} open signal${openSignals.length === 1 ? "" : "s"}` }
        : serviceCounts.unknown
          ? { label: "Evidence incomplete", tone: "evidence", detail: `${serviceCounts.unknown} service health state${serviceCounts.unknown === 1 ? "" : "s"} unverified` }
          : { label: "Platform stable", tone: "stable", detail: "No unresolved control signals" };

  const stateClasses = platformState.tone === "critical"
    ? "border-red-200 bg-red-50 text-red-800"
    : platformState.tone === "attention"
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : ["review", "evidence"].includes(platformState.tone)
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  const summary = profit?.summary || {};
  const topMetrics = [
    {
      label: "Customer organizations",
      value: customerOrganizations.length,
      hint: "Organizations outside the platform owner org",
      icon: Building2,
    },
    {
      label: "Open signals",
      value: openSignals.length,
      hint: criticalSignals.length ? `${criticalSignals.length} critical` : "Control + security evidence",
      icon: ShieldAlert,
    },
    {
      label: "Service health",
      value: services.length ? `${serviceCounts.healthy}/${services.length}` : "—",
      hint: serviceCounts.unknown
        ? `${serviceCounts.unknown} without proven health`
        : serviceCounts.degraded
          ? `${serviceCounts.degraded} degraded`
          : "Persisted healthy evidence",
      icon: Server,
    },
    {
      label: "Recorded profit",
      value: profit ? formatValue(summary.totalProfit) : "—",
      hint: profit ? `Margin ${formatPercent(summary.margin)}` : "Economic evidence unavailable",
      icon: CircleDollarSign,
    },
  ];

  const askBusinessPartner = useCallback((signal) => {
    const organizationName = organizationNames.get(signal?.organization_id) || "platform scope";
    const message = [
      "Investigate this Avantiqo platform signal using authoritative evidence.",
      `Severity: ${severityLabel(signal?.severity)}.`,
      `Organization: ${organizationName}.`,
      `Signal: ${signalTitle(signal)}.`,
      `Evidence: ${signalDetail(signal)}`,
      "Tell me the likely cause, business impact, safest next action, and whether Code or another Avantiqo capability should act. Do not claim a repair without verified evidence.",
    ].join(" ");
    dispatchPartnerMessage(message);
  }, [organizationNames]);

  const askBusinessPartnerAboutService = useCallback((service) => {
    const state = serviceState(service);
    const message = [
      "Review this Avantiqo Platform service using authoritative runtime and provider evidence.",
      `Service: ${clean(service?.service_id) || "unknown"}.`,
      `Persisted status: ${clean(service?.status) || "unknown"}.`,
      `Persisted health: ${clean(service?.health) || "not recorded"}.`,
      `Evidence classification: ${state}.`,
      `Provider: ${clean(service?.default_provider_id) || "not assigned"}.`,
      `Fallback enabled: ${service?.fallback_enabled === true ? "yes" : "no"}.`,
      `Last execution: ${clean(service?.last_execution_at) || "no execution evidence"}.`,
      `Recorded requests: ${numeric(service?.total_requests)}; failures: ${numeric(service?.total_failures)}.`,
      "Determine whether the runtime is actually executable now, what evidence is missing, customer/platform impact, and the safest verification or repair path. Do not describe the service as healthy unless current evidence proves it.",
    ].join(" ");
    dispatchPartnerMessage(message);
  }, []);

  if (loading && !control && !profit) {
    return (
      <div className="flex min-h-[calc(100vh-61px)] items-center justify-center bg-[#F4F3EF] text-[12px] text-[#767169]">
        <RefreshCw size={14} className="mr-2 animate-spin" />
        Loading platform evidence…
      </div>
    );
  }

  return (
    <div
      data-avantiqo-home-page="light"
      data-avantiqo-platform-home="true"
      className="min-h-[calc(100vh-61px)] bg-[#F4F3EF] text-[#191919]"
    >
      <AutonomousWatchAlertBridge organizationId={PLATFORM_ORGANIZATION_ID} />

      <div className="mx-auto max-w-[1800px] px-5 py-7 md:px-8 lg:px-10 lg:py-9">
        <header className="flex flex-col gap-5 border-b border-black/[0.08] pb-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">
                Avantiqo Platform
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.11em] ${stateClasses}`}>
                {platformState.label}
              </span>
            </div>
            <h1 className="mt-3 max-w-4xl text-[31px] font-medium tracking-[-0.045em] text-[#171614] md:text-[38px]">
              Platform control, without the noise.
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6F6A62]">
              Customer health, incidents, economics, service readiness, platform coverage and the Business Partner in one evidence-led owner cockpit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[10px] text-[#716C64] shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              {platformState.detail}
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[10px] text-[#8A857C] shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <Clock3 size={11} />
              {refreshedAt ? `Updated ${relativeTime(refreshedAt)}` : "Awaiting refresh"}
            </div>
            <button
              type="button"
              onClick={() => load({ quiet: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-full border border-black/[0.09] bg-[#1D1C1A] px-3.5 py-1.5 text-[10px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-900">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{error} Showing every authoritative source that did load.</span>
          </div>
        ) : null}

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {topMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="group rounded-2xl border border-black/[0.075] bg-white p-4.5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8C877F]">
                    {metric.label}
                  </div>
                  <Icon size={14} className="text-[#A78158]" />
                </div>
                <div className="mt-3 text-[26px] font-medium tracking-[-0.045em] text-[#191815]">
                  {metric.value}
                </div>
                <div className="mt-1.5 text-[10px] leading-4 text-[#99948B]">{metric.hint}</div>
              </div>
            );
          })}
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.32fr)_minmax(430px,0.68fr)] xl:items-start">
          <main className="min-w-0 space-y-5">
            <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.065] px-5 py-4.5">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">
                    <ShieldAlert size={13} />
                    Needs action now
                  </div>
                  <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                    Exceptions before dashboards
                  </h2>
                  <p className="mt-1 text-[10px] text-[#9A958D]">
                    Unresolved system alerts and security incidents, ranked by severity and recency.
                  </p>
                </div>
                <div className="rounded-full bg-[#F5F2ED] px-2.5 py-1 text-[9px] font-medium text-[#7D7469]">
                  {openSignals.length} open
                </div>
              </div>

              {openSignals.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-6 text-[11px] text-[#6E7569]">
                  <CheckCircle2 size={16} className="text-emerald-650" />
                  No unresolved platform control signals in the current evidence window.
                </div>
              ) : (
                <div className="divide-y divide-black/[0.055]">
                  {openSignals.slice(0, 8).map((signal, index) => {
                    const organizationName = organizationNames.get(signal?.organization_id) || "Platform";
                    return (
                      <div key={signal?.id || `${signalTitle(signal)}:${index}`} className="px-5 py-4 transition hover:bg-[#FCFBF9]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] ${severityClasses(signal?.severity)}`}>
                                {severityLabel(signal?.severity)}
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#918B82]">
                                {organizationName}
                              </span>
                              <span className="text-[9px] text-[#B0AAA1]">{relativeTime(signal?.created_at)}</span>
                            </div>
                            <div className="mt-2 text-[12px] font-medium text-[#332F2A]">{signalTitle(signal)}</div>
                            <div className="mt-1 max-w-3xl text-[10px] leading-4 text-[#817C74]">{signalDetail(signal)}</div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {signal?.organization_id && signal.organization_id !== PLATFORM_ORGANIZATION_ID ? (
                              <Link
                                href={`/workspace/${signal.organization_id}`}
                                className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[9px] font-medium text-[#625D55] transition hover:border-[#C69A68]/40 hover:text-[#8F673E]"
                              >
                                Open org
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => askBusinessPartner(signal)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 py-1.5 text-[9px] font-medium text-[#8A643C] transition hover:border-[#B98A57]/45 hover:bg-[#F8F0E6]"
                            >
                              Ask Partner
                              <ArrowRight size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
              <section className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">
                      <Building2 size={13} />
                      Customer organizations
                    </div>
                    <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                      Who needs you first
                    </h2>
                  </div>
                  <span className="text-[9px] text-[#9D988F]">Ranked by live exceptions</span>
                </div>

                <div className="mt-4 divide-y divide-black/[0.055]">
                  {rankedOrganizations.length === 0 ? (
                    <div className="py-4 text-[11px] text-[#8B867E]">No customer organizations are available.</div>
                  ) : rankedOrganizations.slice(0, 7).map((organization) => (
                    <Link
                      key={organization.id}
                      href={`/workspace/${organization.id}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-medium text-[#3B3731] transition group-hover:text-[#8A623A]">
                          {organization.name || "Organization"}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-[#99938A]">
                          <span>{clean(organization.organization_type || organization.type) || "Customer"}</span>
                          <span>·</span>
                          <span className={organization.openSignals ? "font-medium text-amber-700" : "text-emerald-700"}>
                            {organization.openSignals ? `${organization.openSignals} open signal${organization.openSignals === 1 ? "" : "s"}` : "No open signals"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {organization.economics ? (
                          <div className="hidden text-right sm:block">
                            <div className="text-[10px] font-medium text-[#565047]">{formatValue(organization.economics.profit)}</div>
                            <div className="mt-0.5 text-[8px] uppercase tracking-[0.09em] text-[#AAA49B]">recorded profit</div>
                          </div>
                        ) : null}
                        <ArrowRight size={12} className="text-[#B5AFA5] transition group-hover:translate-x-0.5 group-hover:text-[#9C7044]" />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">
                      <CircleDollarSign size={13} />
                      Platform economics
                    </div>
                    <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                      Value, cost, margin
                    </h2>
                  </div>
                  <Gauge size={16} className="text-[#A88157]" />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5">
                  {[
                    ["Revenue value", summary.totalRevenue],
                    ["Supplier cost", summary.totalCost],
                    ["Profit value", summary.totalProfit],
                    ["Margin", profit ? formatPercent(summary.margin) : null],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#99938A]">{label}</div>
                      <div className="mt-1.5 text-[20px] font-medium tracking-[-0.035em] text-[#292621]">
                        {profit ? (label === "Margin" ? value : formatValue(value)) : "—"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 border-t border-black/[0.06] pt-3 text-[9px] leading-4 text-[#9A958D]">
                  Recorded paid billing and billable service values. No synthetic forecast and no invented currency conversion.
                </div>
              </section>
            </div>

            <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.06] px-5 py-4.5">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">
                    <Server size={13} />
                    Service & infrastructure health
                  </div>
                  <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                    Evidence before green
                  </h2>
                  <p className="mt-1 max-w-2xl text-[10px] leading-4 text-[#9A958D]">
                    A registered or active service is not called healthy until persisted health evidence proves it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[8px] uppercase tracking-[0.09em] text-[#89837A]">
                  <span>{serviceCounts.healthy} proven healthy</span>
                  <span>·</span>
                  <span className={serviceCounts.unknown ? "text-amber-700" : ""}>{serviceCounts.unknown} unknown</span>
                  {serviceCounts.degraded ? <><span>·</span><span className="text-red-700">{serviceCounts.degraded} degraded</span></> : null}
                </div>
              </div>

              {rankedServices.length === 0 ? (
                <div className="px-5 py-6 text-[11px] text-[#8B867E]">
                  No Avantiqo Platform service registry evidence is available.
                </div>
              ) : (
                <div className="divide-y divide-black/[0.055]">
                  {rankedServices.map((service, index) => {
                    const state = serviceState(service);
                    const provider = clean(service?.default_provider_id) || "Provider unassigned";
                    const failures = numeric(service?.total_failures);
                    return (
                      <div key={service?.id || service?.service_id || index} className="px-5 py-3.5 transition hover:bg-[#FCFBF9]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] ${serviceStateClasses(state)}`}>
                                {state}
                              </span>
                              <span className="truncate text-[11px] font-medium text-[#403B34]">
                                {clean(service?.service_id) || "Platform service"}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[#99938A]">
                              <span>{provider}</span>
                              <span>·</span>
                              <span>{clean(service?.status) || "status unknown"}</span>
                              <span>·</span>
                              <span>{service?.last_execution_at ? `last execution ${relativeTime(service.last_execution_at)}` : "no execution evidence"}</span>
                              {failures ? <><span>·</span><span className="text-red-700">{failures} failure{failures === 1 ? "" : "s"}</span></> : null}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => askBusinessPartnerAboutService(service)}
                            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-[#B98A57]/25 bg-[#FBF7F1] px-2.5 py-1.5 text-[9px] font-medium text-[#8A643C] transition hover:border-[#B98A57]/45 hover:bg-[#F8F0E6] sm:self-auto"
                          >
                            Verify with Partner
                            <ArrowRight size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-black/[0.06] bg-[#FBFAF8] px-5 py-3 text-[9px] leading-4 text-[#8F8980]">
                Source: {control?.serviceSource || "operator service registry unavailable"}. Missing health evidence is surfaced as unknown, never silently converted to healthy.
              </div>
            </section>

            <section className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">
                    <Layers3 size={13} />
                    Module coverage
                  </div>
                  <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                    Platform capability surface
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 text-[8px] uppercase tracking-[0.09em] text-[#89837A]">
                  <span>{moduleCounts.active} active</span>
                  <span>·</span>
                  <span>{moduleCounts.registered} registered</span>
                  {moduleCounts.degraded ? <><span>·</span><span className="text-red-700">{moduleCounts.degraded} degraded</span></> : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {rankedModules.length === 0 ? (
                  <div className="py-4 text-[11px] text-[#8B867E]">No platform modules were returned by the control source.</div>
                ) : rankedModules.slice(0, 15).map((module, index) => {
                  const state = moduleState(module);
                  return (
                    <div key={module?.id || module?.module_id || index} className="flex items-center gap-2.5 border-b border-black/[0.055] py-3">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${moduleStateClasses(state)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-medium text-[#4B463F]">
                          {clean(module?.name || module?.module_name || module?.label || module?.id) || "Platform module"}
                        </div>
                      </div>
                      <span className="text-[8px] uppercase tracking-[0.08em] text-[#AAA49B]">{state}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">
                    <Activity size={13} />
                    Recent movement
                  </div>
                  <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                    What just changed
                  </h2>
                </div>
                <span className="text-[9px] text-[#A09A91]">{control?.activitySource || "Platform control evidence"}</span>
              </div>

              <div className="mt-4 divide-y divide-black/[0.055]">
                {activity.slice(0, 10).map((item, index) => (
                  <div key={item?.id || `${signalTitle(item)}:${index}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 py-3 text-[10px]">
                    <div className="text-[#A7A198]">{relativeTime(item?.created_at)}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#4A453E]">{signalTitle(item)}</div>
                      <div className="mt-0.5 truncate text-[#989289]">{signalDetail(item)}</div>
                    </div>
                    <span className={`self-start rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] ${severityClasses(item?.severity)}`}>
                      {severityLabel(item?.severity)}
                    </span>
                  </div>
                ))}
                {activity.length === 0 ? (
                  <div className="py-4 text-[11px] text-[#8B867E]">No recent platform activity is available.</div>
                ) : null}
              </div>
            </section>
          </main>

          <aside className="min-w-0 xl:sticky xl:top-[78px]">
            <div className="overflow-hidden rounded-[24px] border border-black/[0.085] bg-white shadow-[0_18px_55px_rgba(31,27,20,0.08)]">
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.07] px-5 py-4.5">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">
                    <Sparkles size={13} />
                    Business Partner
                  </div>
                  <div className="mt-1.5 text-[19px] font-medium tracking-[-0.03em] text-[#1B1A18]">
                    Operate, diagnose, ship.
                  </div>
                  <div className="mt-1 text-[10px] leading-5 text-[#8B867E]">
                    Ask about customers, incidents, economics, service health or code. Evidence stays connected to the same governed operator.
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#6F7E68]/20 bg-[#6F7E68]/[0.08] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.11em] text-[#5E6D58]">
                  Owner scope
                </span>
              </div>

              <BusinessPartnerCodeMissionPanel organizationId={PLATFORM_ORGANIZATION_ID} />
              <HomeAvantiqoIntelligenceDock organizationId={PLATFORM_ORGANIZATION_ID} />
            </div>
          </aside>
        </div>
      </div>

      <style jsx global>{`
        body:has([data-avantiqo-home-page="light"]) {
          background: #f4f3ef !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"] {
          min-height: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          padding: 18px !important;
          color: #191919 !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"]
          > div:first-child {
          display: none !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"]
          [class*="text-white"],
        [data-avantiqo-home-page="light"]
          [data-avantiqo-live-execution-panel="true"]
          [class*="text-white"] {
          color: rgba(35, 33, 30, 0.68) !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"]
          [class*="border-white"],
        [data-avantiqo-home-page="light"]
          [data-avantiqo-live-execution-panel="true"]
          [class*="border-white"] {
          border-color: rgba(24, 23, 21, 0.09) !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"]
          [class*="bg-black"],
        [data-avantiqo-home-page="light"]
          [data-avantiqo-live-execution-panel="true"][class*="bg-black"] {
          background-color: rgba(30, 28, 25, 0.035) !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-live-execution-panel="true"] {
          margin: 12px 12px 0 !important;
          border-color: rgba(154, 116, 75, 0.22) !important;
          background: #fbfaf8 !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"] input,
        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"] textarea {
          color: #191919 !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"] input::placeholder,
        [data-avantiqo-home-page="light"]
          [data-avantiqo-home-intelligence="true"] textarea::placeholder {
          color: #a19d95 !important;
        }

        [data-avantiqo-home-page="light"]
          [data-avantiqo-developer-attachments="true"] {
          color: #716d66 !important;
        }

        @media (min-width: 1280px) {
          [data-avantiqo-home-page="light"]
            [data-avantiqo-home-dock="true"]
            [data-avantiqo-home-intelligence="true"] {
            height: clamp(620px, calc(100dvh - 205px), 840px) !important;
          }
        }
      `}</style>
    </div>
  );
}
