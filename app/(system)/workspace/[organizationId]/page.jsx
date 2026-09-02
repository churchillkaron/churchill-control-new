"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  Search,
  Sparkles,
} from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import AutonomousWatchAlertBridge from "@/components/operator/AutonomousWatchAlertBridge";
import HomeAvantiqoIntelligenceDock from "@/components/operator/HomeAvantiqoIntelligenceDock";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";
import { listOperatorNavigationTargets } from "@/lib/operator/runtime/OperatorNavigationCatalog";

const PENDING_UNIVERSAL_COMMAND_KEY = "avantiqo:pending-universal-command:v1";

function text(value) {
  return String(value ?? "").trim();
}

function metricValue(metric) {
  const value = metric?.formatted ?? metric?.value;
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function firstName(value) {
  const clean = text(value);
  if (!clean || clean.includes("@")) return "";
  return clean.split(/\s+/)[0];
}

function priorityDot(priority) {
  if (priority === "critical") return "bg-red-600";
  if (priority === "attention") return "bg-amber-600";
  return "bg-[#A37849]";
}

export default function OrganizationWorkspacePage() {
  const { runtime, organization, loading } = useOrganizationRuntime();
  const businessContext = useBusinessContext() || {};

  const organizationId =
    organization?.id ||
    runtime?.activeOrganization?.id ||
    businessContext.organization_id ||
    businessContext.organization?.id ||
    null;

  const personName =
    runtime?.access?.staff?.name ||
    runtime?.access?.staff?.display_name ||
    businessContext.staff?.name ||
    businessContext.staff?.display_name ||
    "";
  const organizationName =
    organization?.name ||
    runtime?.activeOrganization?.name ||
    businessContext.organization?.name ||
    "Your organization";
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    "All entities";
  const periodName =
    businessContext.period?.name ||
    businessContext.period?.period_name ||
    businessContext.period?.label ||
    "Current period";

  const briefing = runtime?.briefing || null;
  const metrics = runtime?.metrics || {};
  const activity = Array.isArray(runtime?.activity) ? runtime.activity : [];
  const homeQueue = Array.isArray(runtime?.home_queue) ? runtime.home_queue : [];
  const homeDomains = Array.isArray(runtime?.home_domains) ? runtime.home_domains : [];

  const domainTargets = useMemo(() => {
    if (!organizationId) return [];
    return listOperatorNavigationTargets({ organizationId })
      .filter((target) => target.kind === "domain")
      .slice(0, 12);
  }, [organizationId]);

  const metricCards = [
    {
      label: "Revenue",
      value: metricValue(metrics.revenue),
      hint: "Posted Finance truth",
    },
    {
      label: "Orders",
      value: metricValue(metrics.orders),
      hint: "Current operating period",
    },
    {
      label: "Approvals",
      value: metricValue(metrics.approvals),
      hint: "Waiting for decision",
    },
    {
      label: "Attention",
      value: metricValue(metrics.attention),
      hint: "Cross-domain exceptions",
    },
  ];

  useEffect(() => {
    if (!organizationId) return;

    let pending = "";
    try {
      pending = text(window.sessionStorage.getItem(PENDING_UNIVERSAL_COMMAND_KEY));
      if (pending) window.sessionStorage.removeItem(PENDING_UNIVERSAL_COMMAND_KEY);
    } catch {
      pending = "";
    }
    if (!pending) return;

    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("avantiqo:home-command", {
          detail: { message: pending, source: "text" },
        }),
      );
    }, 80);

    return () => window.clearTimeout(timer);
  }, [organizationId]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-61px)] items-center justify-center bg-[#F7F6F3] text-sm text-[#6C6963]">
        Preparing your workspace...
      </div>
    );
  }

  const greetingName = firstName(personName);

  return (
    <div
      data-avantiqo-home-page="light"
      className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] text-[#191919]"
    >
      <AutonomousWatchAlertBridge organizationId={organizationId} />

      <div className="mx-auto max-w-[1780px] px-5 py-7 md:px-8 lg:px-10 lg:py-9">
        <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9A744B]">
              My Business
            </div>
            <h1 className="mt-2 text-[30px] font-medium tracking-[-0.04em] text-[#181817] md:text-[34px]">
              {greetingName ? `Welcome back, ${greetingName}` : "Your business at a glance"}
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6C6963]">
              {briefing?.summary || "Live priorities, business movement and your Avantiqo operator in one place."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6C6963]">
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {organizationName}
            </span>
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {entityName}
            </span>
            <span className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              {periodName}
            </span>
          </div>
        </header>

        <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)] xl:items-start">
          <div className="min-w-0 space-y-6">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metricCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-black/[0.075] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
                >
                  <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#8A867F]">
                    {item.label}
                  </div>
                  <div className="mt-3 text-[25px] font-medium tracking-[-0.035em] text-[#1A1917]">
                    {item.value}
                  </div>
                  <div className="mt-1.5 text-[11px] text-[#9A968E]">
                    {item.hint}
                  </div>
                </div>
              ))}
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">
                      Needs attention
                    </div>
                    <div className="mt-1 text-[12px] text-[#AAA69E]">
                      Ranked work across the business
                    </div>
                  </div>
                  <Bell size={16} className={homeQueue.length ? "text-[#B98C58]" : "text-[#6F7E68]"} />
                </div>

                <div className="mt-4 divide-y divide-black/[0.06]">
                  {homeQueue.length === 0 ? (
                    <div className="flex items-center gap-3 py-4 text-[12px] text-[#79756E]">
                      <CheckCircle2 size={15} className="text-[#6F7E68]" />
                      No active cross-domain exceptions.
                    </div>
                  ) : (
                    homeQueue.slice(0, 10).map((item) => (
                      <Link key={item.id} href={item.href || "#"} className="group flex gap-3 py-3.5">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot(item.priority)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-[#3E3A34]">{item.title}</span>
                            <span className="rounded-full border border-black/[0.07] bg-[#FAF9F7] px-2 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-[#8A847C]">{item.domain}</span>
                          </div>
                          <div className="mt-1 text-[10px] leading-4 text-[#8B867E]">{item.detail}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-[9px] text-[#9A968E]">
                          {item.status}
                          <ArrowRight size={11} className="transition group-hover:translate-x-0.5 group-hover:text-[#A37849]" />
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">
                      Recent activity
                    </div>
                    <div className="mt-1 text-[12px] text-[#AAA69E]">
                      Latest business movement
                    </div>
                  </div>
                  <Clock3 size={16} className="text-[#8D8982]" />
                </div>

                <div className="mt-4 divide-y divide-black/[0.06]">
                  {activity.length === 0 ? (
                    <div className="py-4 text-[12px] text-[#8A867F]">
                      No recent activity to show.
                    </div>
                  ) : (
                    activity.slice(0, 7).map((item, index) => (
                      <div key={item?.id || index} className="grid grid-cols-[70px_1fr] gap-3 py-3.5 text-[11px]">
                        <div className="text-[#AAA69E]">{item?.time || "—"}</div>
                        <div className="leading-5 text-[#4F4C47]">{item?.text || item?.message || "Activity"}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {homeDomains.length ? (
              <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">
                      Business pulse
                    </div>
                    <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1B1A18]">
                      Where attention is concentrated
                    </h2>
                  </div>
                  <div className="text-[10px] text-[#8A867F]">Live domain-owned evidence</div>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {homeDomains.map((domain) => (
                    <Link key={domain.id} href={domain.href} className="group rounded-xl border border-black/[0.065] bg-[#FCFBF9] p-3.5 transition hover:border-[#D6A66A]/40 hover:bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[12px] font-medium text-[#403C36]">{domain.label}</div>
                        <div className={`min-w-7 rounded-full px-2 py-1 text-center text-[9px] font-semibold ${Number(domain.count || 0) > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{domain.count || 0}</div>
                      </div>
                      <div className="mt-2 text-[9px] leading-4 text-[#8A847C]">{domain.detail}</div>
                      <div className="mt-2 flex items-center gap-1 text-[9px] text-[#A37849] opacity-0 transition group-hover:opacity-100">Open <ArrowRight size={10} /></div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8A867F]">
                    Business areas
                  </div>
                  <h2 className="mt-1.5 text-[20px] font-medium tracking-[-0.025em] text-[#1B1A18]">
                    Everything Avantiqo can operate
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[#8A867F]">
                  <Search size={12} />
                  Registry-driven · no industry hardcoding
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
                {domainTargets.map((target) => (
                  <Link
                    key={target.id}
                    href={target.href}
                    className="group flex items-center justify-between gap-4 border-b border-black/[0.06] py-3.5 transition hover:border-[#D6A66A]/35"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#292723] transition group-hover:text-[#8E663D]">
                        {target.name}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[#A09C94]">
                        {target.description || "Open workspace"}
                      </div>
                    </div>
                    <ArrowRight size={13} className="shrink-0 text-[#B7B3AB] transition group-hover:translate-x-0.5 group-hover:text-[#B2814E]" />
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="min-w-0 xl:sticky xl:top-[78px]">
            <div className="overflow-hidden rounded-[22px] border border-black/[0.08] bg-white shadow-[0_14px_50px_rgba(31,27,20,0.07)]">
              <div className="flex items-start justify-between gap-4 border-b border-black/[0.07] px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">
                    <Sparkles size={13} />
                    Avantiqo Intelligence
                  </div>
                  <div className="mt-1.5 text-[18px] font-medium tracking-[-0.025em] text-[#1B1A18]">
                    One operator. Every capability.
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-[#8B8881]">
                    The global command bar and this conversation are the same operator.
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#6F7E68]/20 bg-[#6F7E68]/[0.08] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[#5E6D58]">
                  Local-first
                </span>
              </div>

              <HomeAvantiqoIntelligenceDock organizationId={organizationId} />
            </div>
          </aside>
        </div>
      </div>

      <style jsx global>{`
        body:has([data-avantiqo-home-page="light"]) {
          background: #f7f6f3 !important;
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
