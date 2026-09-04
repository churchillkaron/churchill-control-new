"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

function text(value) {
  return String(value ?? "").trim();
}

function hrefFor(organizationId, route) {
  return `/workspace/${encodeURIComponent(organizationId)}${route}`;
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "No next visit";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function planCustomer(plan) {
  return text(plan?.attributes?.service_delivery?.customer_name) || "Customer";
}

function preferredTechnician(plan) {
  const delivery = plan?.attributes?.service_delivery || {};
  return text(plan?.preferred_staff_name || delivery.preferred_staff_name);
}

function billingMode(plan) {
  return text(plan?.attributes?.service_delivery?.billing?.mode || "none").toLowerCase();
}

function activePlan(plan) {
  return text(plan?.status).toLowerCase() === "active";
}

function Metric({ label, value, detail, attention = false }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-[#FBFAF8] px-4 py-3.5">
      <div className="text-[8px] font-medium uppercase tracking-[0.14em] text-[#918C84]">{label}</div>
      <div className={`mt-2 text-[21px] font-medium tracking-[-0.035em] ${attention && Number(value) > 0 ? "text-[#98513D]" : "text-[#26231F]"}`}>
        {value}
      </div>
      <div className="mt-1 text-[9px] leading-4 text-[#9A968E]">{detail}</div>
    </div>
  );
}

function issueFor(plan, templateById, now) {
  if (!activePlan(plan)) return null;

  const nextVisit = dateValue(plan.next_service_at);
  const protocolId = text(plan.execution_template_id);
  const protocol = protocolId ? templateById.get(protocolId) : null;
  const contractEnd = dateValue(plan.contract_end);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (nextVisit && nextVisit.getTime() < now.getTime()) {
    return {
      score: 1000,
      state: "OVERDUE",
      title: "Recover overdue service cadence",
      detail: "The next committed visit is already past due. Generate or recover the visit before healthy recurring work is moved.",
    };
  }

  if (!protocolId) {
    return {
      score: 800,
      state: "PROTOCOL",
      title: "Attach treatment protocol",
      detail: "This active plan has no execution protocol, so inspection, treatment and evidence requirements are not locked for the technician.",
    };
  }

  if (!protocol || text(protocol.status).toLowerCase() !== "active") {
    return {
      score: 760,
      state: "PROTOCOL",
      title: "Review treatment protocol",
      detail: "The linked protocol is unavailable or inactive. Resolve it before the next visit is generated.",
    };
  }

  if (contractEnd && contractEnd.getTime() >= now.getTime() && contractEnd.getTime() - now.getTime() <= thirtyDays) {
    return {
      score: 520,
      state: "CONTRACT",
      title: "Review ending service commitment",
      detail: "The recurring service commitment ends within 30 days. Confirm the commercial follow-up before cadence stops.",
    };
  }

  if (nextVisit && nextVisit.getTime() >= now.getTime() && nextVisit.getTime() - now.getTime() <= sevenDays && !preferredTechnician(plan)) {
    return {
      score: 260,
      state: "DISPATCH",
      title: "Confirm technician continuity",
      detail: "A visit is due within seven days and no preferred technician is carried by the plan. Dispatch can still assign the best eligible technician.",
    };
  }

  return null;
}

function stateTone(state) {
  if (state === "OVERDUE") return "border-[#B36B52]/20 bg-[#B36B52]/[0.07] text-[#98513D]";
  if (state === "PROTOCOL") return "border-[#A37849]/18 bg-[#A37849]/[0.07] text-[#76583A]";
  if (state === "CONTRACT") return "border-[#C08A4A]/20 bg-[#C08A4A]/[0.08] text-[#8B6236]";
  return "border-black/[0.07] bg-[#F7F6F3] text-[#77736C]";
}

export default function PestControlServiceHealth({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: null, plans: [], templates: [] });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!organizationId) return;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const encodedOrganizationId = encodeURIComponent(organizationId);
      const [plansResponse, templatesResponse] = await Promise.all([
        fetch(`/api/service-management/plans?organizationId=${encodedOrganizationId}&limit=500`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`/api/service-management/execution-templates?organizationId=${encodedOrganizationId}&status=all&limit=500`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);
      const [plansJson, templatesJson] = await Promise.all([
        plansResponse.json().catch(() => ({})),
        templatesResponse.json().catch(() => ({})),
      ]);

      if (!plansResponse.ok || plansJson.success === false) {
        throw new Error(plansJson.error || "Recurring service plans could not be loaded");
      }
      if (!templatesResponse.ok || templatesJson.success === false) {
        throw new Error(templatesJson.error || "Treatment protocols could not be loaded");
      }

      setState({
        loading: false,
        error: null,
        plans: Array.isArray(plansJson.rows) ? plansJson.rows : [],
        templates: Array.isArray(templatesJson.rows) ? templatesJson.rows : [],
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || "Pest Control service health could not be loaded",
      }));
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const intelligence = useMemo(() => {
    const now = new Date();
    const sevenDaysFromNow = now.getTime() + (7 * 24 * 60 * 60 * 1000);
    const active = state.plans.filter(activePlan);
    const templateById = new Map(state.templates.map((template) => [text(template.id), template]));
    const activeTemplateIds = new Set(
      state.templates
        .filter((template) => text(template.status).toLowerCase() === "active")
        .map((template) => text(template.id)),
    );

    const overdue = active.filter((plan) => {
      const next = dateValue(plan.next_service_at);
      return Boolean(next && next.getTime() < now.getTime());
    });
    const dueNextSevenDays = active.filter((plan) => {
      const next = dateValue(plan.next_service_at);
      return Boolean(next && next.getTime() >= now.getTime() && next.getTime() <= sevenDaysFromNow);
    });
    const protocolReady = active.filter((plan) => {
      const protocolId = text(plan.execution_template_id);
      return Boolean(protocolId && activeTemplateIds.has(protocolId));
    });
    const billed = active.filter((plan) => ["per_visit", "recurring", "prepaid"].includes(billingMode(plan)));

    const exceptions = active
      .map((plan) => ({ plan, issue: issueFor(plan, templateById, now) }))
      .filter((item) => item.issue)
      .sort((a, b) => b.issue.score - a.issue.score || (dateValue(a.plan.next_service_at)?.getTime() || Number.MAX_SAFE_INTEGER) - (dateValue(b.plan.next_service_at)?.getTime() || Number.MAX_SAFE_INTEGER));

    return {
      active,
      overdue,
      dueNextSevenDays,
      protocolReady,
      billed,
      exceptions,
    };
  }, [state.plans, state.templates]);

  const planHref = hrefFor(organizationId, "/operations/field-service/service-plans");
  const protocolHref = hrefFor(organizationId, "/operations/field-service/execution-templates");
  const dispatchHref = hrefFor(organizationId, "/operations/dispatch");
  const reportsHref = hrefFor(organizationId, "/operations/field-service/service-reports");

  return (
    <section className="overflow-hidden rounded-2xl border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] px-5 py-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#9A744B]">Recurring service intelligence</div>
          <h2 className="mt-1 text-[17px] font-medium tracking-[-0.025em] text-[#23211E]">Protect customer cadence before it becomes a callback</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-[#9A968E]">
            Live plan health joins recurring commitments, treatment protocols, technician continuity and billing readiness without changing the neutral Operations runtime.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143] transition hover:border-[#D6A66A]/45"
          aria-label="Refresh recurring service health"
        >
          <RefreshCw size={11} className={state.loading ? "animate-spin" : ""} />
        </button>
      </div>

      {state.error ? (
        <div className="m-5 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-3.5 py-3 text-[10px] leading-4 text-[#8B4937]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Metric label="Active plans" value={state.loading ? "…" : intelligence.active.length} detail="Live recurring commitments" />
            <Metric label="Due 7 days" value={state.loading ? "…" : intelligence.dueNextSevenDays.length} detail="Upcoming service cadence" />
            <Metric label="Cadence overdue" value={state.loading ? "…" : intelligence.overdue.length} detail="Commitments already missed" attention />
            <Metric label="Protocol ready" value={state.loading ? "…" : `${intelligence.protocolReady.length}/${intelligence.active.length}`} detail="Active plans with live protocol" />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-black/[0.065]">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.055] bg-[#FBFAF8] px-4 py-3">
              <div>
                <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#8A867F]">Plan exceptions</div>
                <div className="mt-0.5 text-[9px] text-[#A09A92]">Only recurring commitments with a surfaced operating risk.</div>
              </div>
              <span className="text-[12px] font-medium text-[#3A3631]">{state.loading ? "…" : intelligence.exceptions.length}</span>
            </div>

            <div className="divide-y divide-black/[0.055]">
              {!state.loading && intelligence.exceptions.length === 0 ? (
                <div className="flex items-center gap-2.5 px-4 py-6 text-[10px] text-[#77736C]">
                  <CheckCircle2 size={13} className="text-[#718167]" />
                  Recurring service plans have no surfaced cadence or protocol exception.
                </div>
              ) : null}

              {intelligence.exceptions.slice(0, 8).map(({ plan, issue }) => (
                <Link key={plan.id} href={planHref} className="group grid gap-2 px-4 py-3.5 transition hover:bg-[#FCFBF9] md:grid-cols-[minmax(150px,0.8fr)_minmax(240px,1.25fr)_120px_auto] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-medium text-[#403C37] group-hover:text-[#8D6338]">{planCustomer(plan)}</div>
                    <div className="mt-0.5 truncate text-[8px] text-[#99948C]">{text(plan.service_name) || "Recurring service"}{plan.customer_location_name ? ` · ${plan.customer_location_name}` : ""}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-medium text-[#45413B]">{issue.title}</div>
                    <div className="mt-0.5 truncate text-[8px] text-[#989189]">{issue.detail}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8px] text-[#817A72]"><Clock3 size={9} />{formatDate(plan.next_service_at)}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[7px] font-medium uppercase tracking-[0.06em] ${stateTone(issue.state)}`}>{issue.state}</span>
                    <ArrowRight size={10} className="text-[#B7B3AB] group-hover:text-[#A37849]" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-black/[0.065] bg-[#FBFAF8] p-4">
            <div className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A867F]"><ShieldCheck size={10} /> Service readiness</div>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] pb-3">
                <div><div className="text-[10px] font-medium text-[#4A4640]">Treatment protocol coverage</div><div className="mt-0.5 text-[8px] text-[#99948C]">Inspection, treatment and evidence rules locked</div></div>
                <span className="text-[13px] font-medium text-[#2C2925]">{state.loading ? "…" : `${intelligence.protocolReady.length}/${intelligence.active.length}`}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] pb-3">
                <div><div className="flex items-center gap-1.5 text-[10px] font-medium text-[#4A4640]"><UserRound size={9} /> Technician continuity</div><div className="mt-0.5 text-[8px] text-[#99948C]">Preferred technician carried when appropriate</div></div>
                <span className="text-[13px] font-medium text-[#2C2925]">{state.loading ? "…" : intelligence.active.filter((plan) => preferredTechnician(plan)).length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-[10px] font-medium text-[#4A4640]">Billing handoff configured</div><div className="mt-0.5 text-[8px] text-[#99948C]">Prepaid, per-visit or recurring billing carried by plan</div></div>
                <span className="text-[13px] font-medium text-[#2C2925]">{state.loading ? "…" : `${intelligence.billed.length}/${intelligence.active.length}`}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#A37849]/14 bg-[#FFFDF9] p-4">
            <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A633C]">Operator controls</div>
            <div className="mt-2 divide-y divide-[#A37849]/10">
              {[
                ["Recurring service plans", "Cadence, customer site, technician preference and billing", planHref],
                ["Treatment protocols", "Inspection, evidence and completion requirements", protocolHref],
                ["Today’s dispatch", "Assign and protect the live service day", dispatchHref],
                ["Service reports", "Customer-safe proof from completed work", reportsHref],
              ].map(([label, detail, href]) => (
                <Link key={label} href={href} className="group flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0"><div className="text-[9px] font-medium text-[#5B5147] group-hover:text-[#8D6338]">{label}</div><div className="mt-0.5 truncate text-[8px] text-[#9A8F83]">{detail}</div></div>
                  <ArrowRight size={9} className="shrink-0 text-[#B7A895] group-hover:text-[#8D6338]" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
