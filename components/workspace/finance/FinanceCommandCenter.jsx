"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Landmark,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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

function financeHref(organizationId, route) {
  if (!organizationId || !route) return "#";
  return `/workspace/${organizationId}${route.startsWith("/") ? route : `/${route}`}`;
}

function money(value, currencyCode) {
  const number = Number(value || 0);
  try {
    return currencyCode
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode,
          maximumFractionDigits: 2,
        }).format(number)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number);
  } catch {
    return `${currencyCode || ""} ${new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(number)}`.trim();
  }
}

function periodLabel(period) {
  if (!period) return "Select a period";
  return (
    period.period_name ||
    period.name ||
    period.label ||
    (period.start_date && period.end_date
      ? `${period.start_date} – ${period.end_date}`
      : "Accounting period")
  );
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

function sourceKeyForKind(kind) {
  if (kind === "review") return "finance_review_items";
  if (kind === "reconciliation") return "finance_bank_reconciliation_runs";
  if (kind === "approval") return "finance_approval_requests";
  if (kind === "filing") return "finance_statutory_filings";
  if (kind === "close") return "finance_period_close_steps";
  return null;
}

function evidenceForKind(kind) {
  if (kind === "review") return "Review state, due date, priority and governed workpaper";
  if (kind === "reconciliation") return "Bank reconciliation run, status and balance difference";
  if (kind === "approval") return "Approval request, amount and assigned decision role";
  if (kind === "filing") return "Statutory filing state, authority and due date";
  if (kind === "close") return "Period-close checklist and evidence state";
  return "Current Finance control data";
}

function actionForKind(kind, status) {
  const normalized = text(status).toUpperCase();
  if (kind === "review" && normalized === "CHANGES_REQUESTED") return "Resolve review points";
  if (kind === "review") return "Open review workpaper";
  if (kind === "reconciliation") return "Resolve reconciliation variance";
  if (kind === "approval") return "Make the governed decision";
  if (kind === "filing") return "Prepare filing action";
  if (kind === "close") return "Complete the close control";
  return "Open the work item";
}

function buildFinanceIntelligence({ queue, metrics, close, practice, sources }) {
  const first = queue[0] || null;
  const sourceKey = sourceKeyForKind(first?.kind);
  const sourceConnected = sourceKey ? sources?.[sourceKey]?.status === "connected" : true;
  const connectedSources = Object.values(sources || {}).filter(
    (source) => source?.status === "connected",
  ).length;
  const failedSources = Object.values(sources || {}).filter(
    (source) => source?.status === "error",
  ).length;
  const totalSources = Object.keys(sources || {}).length;
  const closeOpen = Math.max(0, Number(close?.total || 0) - Number(close?.completed || 0));
  const reviewPressure =
    Number(metrics?.review?.ready || 0) + Number(metrics?.review?.changes_requested || 0);
  const statutoryRisk = Number(metrics?.filings?.overdue || 0);
  const activeClients = Number(practice?.active_clients || 0);

  if (!first) {
    return {
      state: "clear",
      title: "No Finance exception is asking for intervention",
      detail:
        closeOpen > 0
          ? `${closeOpen} close control${closeOpen === 1 ? " remains" : "s remain"}, but none is currently ranked as an exception.`
          : "The current period has no ranked approval, review, reconciliation, filing or close exception.",
      action: closeOpen > 0 ? "Continue period close" : "Review financial truth",
      href: closeOpen > 0 ? "/finance/close" : "/finance/books",
      evidence: "Current Finance control queue and source health",
      grounded: failedSources === 0,
      connectedSources,
      failedSources,
      totalSources,
      reviewPressure,
      statutoryRisk,
      activeClients,
    };
  }

  return {
    state: first.priority === "attention" ? "attention" : "review",
    title: first.title,
    detail: first.detail || `${titleCase(first.kind)} requires a human decision or handoff.`,
    action: actionForKind(first.kind, first.status),
    href: first.href,
    evidence: evidenceForKind(first.kind),
    grounded: sourceConnected,
    connectedSources,
    failedSources,
    totalSources,
    reviewPressure,
    statutoryRisk,
    activeClients,
  };
}

function MetricCard({ label, value, detail, icon: Icon, warning = false, href }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#817D76]">
          {label}
        </div>
        <Icon size={13} className={warning ? "text-[#9A533D]" : "text-[#A37849]"} />
      </div>
      <div className="mt-2 text-[20px] font-semibold tracking-[-0.035em] text-[#1B1A18]">
        {value}
      </div>
      <div className={`mt-1 text-[8px] ${warning ? "text-[#8B4937]" : "text-[#8A867F]"}`}>
        {detail}
      </div>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-2xl border border-black/[0.07] bg-white p-3.5 transition hover:border-[#A37849]/30 hover:bg-[#FFFCF8]"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-3.5">{body}</div>
  );
}

function SourceTrust({ intelligence }) {
  const healthy = intelligence.failedSources === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#8C867E]">
      <span
        className={`inline-flex items-center gap-1 font-semibold ${
          healthy ? "text-[#63735E]" : "text-[#9A533D]"
        }`}
      >
        <ShieldCheck size={9} />
        {intelligence.connectedSources}/{intelligence.totalSources || intelligence.connectedSources} control sources connected
      </span>
      {intelligence.failedSources > 0 ? (
        <span>· {intelligence.failedSources} source warning</span>
      ) : null}
      <span>· Recommendations never bypass approval or sign-off controls</span>
    </div>
  );
}

export default function FinanceCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const entityName =
    businessContext.entity?.display_name ||
    businessContext.entity?.legal_name ||
    businessContext.entity?.name ||
    "Select legal entity";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  async function load() {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/workspace/finance/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      if (periodId) url.searchParams.set("periodId", periodId);
      const response = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Finance workspace failed (${response.status})`);
      }
      setData(json);
    } catch (loadError) {
      setData(null);
      setError(loadError.message || "Finance workspace could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId, periodId]);

  const currency =
    data?.context?.currency ||
    businessContext.entity?.currency ||
    businessContext.organization?.default_currency ||
    null;
  const metrics = data?.metrics || {};
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const close = data?.close || { steps: [], completed: 0, total: 0, progress: 0 };
  const practice = data?.practice || { active_clients: 0, clients: [] };
  const recentWork = Array.isArray(data?.recent_work) ? data.recent_work : [];
  const sources = data?.sources || {};
  const isFirmMode = Number(practice.active_clients || 0) > 0;

  const intelligence = useMemo(
    () => buildFinanceIntelligence({ queue, metrics, close, practice, sources }),
    [queue, metrics, close, practice, sources],
  );

  const closeOpen = Math.max(0, Number(close.total || 0) - Number(close.completed || 0));

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 text-[#1B1A18]">
      <section className="rounded-[24px] border border-black/[0.07] bg-white px-5 py-4 shadow-[0_8px_28px_rgba(31,27,20,0.04)] md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.17em] text-[#A37849]">
              <span>Finance workbench</span>
              {isFirmMode ? (
                <span className="rounded-full border border-[#A37849]/20 bg-[#A37849]/[0.07] px-2 py-1 tracking-[0.08em] text-[#76583A]">
                  Accounting firm · {practice.active_clients} active clients
                </span>
              ) : null}
            </div>
            <h1 className="mt-1.5 text-[23px] font-semibold tracking-[-0.03em] text-[#1B1A18]">
              Decide what moves next
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] text-[#817B73]">
              <span className="font-semibold text-[#625D56]">{entityName}</span>
              <span>·</span>
              <span>{periodLabel(businessContext.period)}</span>
              {data?.context?.period_status ? (
                <>
                  <span>·</span>
                  <span className="text-[#8A633C]">{titleCase(data.context.period_status)}</span>
                </>
              ) : null}
              {data?.generated_at ? (
                <>
                  <span>·</span>
                  <span>
                    Control view refreshed{" "}
                    {new Date(data.generated_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <Link
              href={financeHref(organizationId, "/finance/work")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white"
            >
              My work <ArrowRight size={9} />
            </Link>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] disabled:opacity-50"
            >
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {!entityId || !periodId ? (
        <section className="rounded-2xl border border-amber-700/15 bg-amber-50 p-5 text-[10px] text-amber-900">
          Select a legal entity and accounting period in the top bar to load financial truth, close status and governed exceptions.
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-red-700/15 bg-red-50 p-5 text-[10px] text-red-800">
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} className="mt-0.5" />
            <div>
              <div className="font-semibold">Finance workbench could not load</div>
              <div className="mt-1">{error}</div>
            </div>
          </div>
        </section>
      ) : loading && !data ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-black/[0.07] bg-white text-[10px] text-[#767169]">
          <LoaderCircle size={14} className="mr-2 animate-spin text-[#A37849]" />
          Loading governed Finance work…
        </div>
      ) : (
        <>
          {isFirmMode ? (
            <section className="rounded-[22px] border border-[#A37849]/15 bg-[#FBF8F3] p-4 md:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
                    <Users size={10} /> Practice pulse
                  </div>
                  <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#322E29]">
                    The firm, before the ledger
                  </h2>
                  <p className="mt-0.5 text-[8px] text-[#8B847B]">
                    Client workload, review pressure and close risk stay visible before people start opening modules.
                  </p>
                </div>
                <Link
                  href={financeHref(organizationId, "/finance/work")}
                  className="text-[8px] font-semibold text-[#76583A]"
                >
                  Open practice work →
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#938D85]">
                    Active clients
                  </div>
                  <div className="mt-1 text-[17px] font-semibold tabular-nums text-[#36312C]">
                    {practice.active_clients || 0}
                  </div>
                </div>
                <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#938D85]">
                    Review pressure
                  </div>
                  <div
                    className={`mt-1 text-[17px] font-semibold tabular-nums ${
                      intelligence.reviewPressure > 0 ? "text-[#8A633C]" : "text-[#36312C]"
                    }`}
                  >
                    {intelligence.reviewPressure}
                  </div>
                  <div className="mt-0.5 text-[7px] text-[#AAA39B]">selected client · ready + changes</div>
                </div>
                <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#938D85]">
                    Recent handoffs
                  </div>
                  <div className="mt-1 text-[17px] font-semibold tabular-nums text-[#36312C]">
                    {recentWork.length}
                  </div>
                  <div className="mt-0.5 text-[7px] text-[#AAA39B]">latest governed procedures</div>
                </div>
                <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2.5">
                  <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#938D85]">
                    Close controls open
                  </div>
                  <div
                    className={`mt-1 text-[17px] font-semibold tabular-nums ${
                      closeOpen > 0 ? "text-[#8A633C]" : "text-[#36312C]"
                    }`}
                  >
                    {closeOpen}
                  </div>
                  <div className="mt-0.5 text-[7px] text-[#AAA39B]">current selected entity</div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.55fr)]">
            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A867F]">
                    Human attention queue
                  </div>
                  <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em]">
                    Work ranked by what can move
                  </h2>
                  <div className="mt-0.5 text-[8px] text-[#918B83]">
                    Changes, overdue controls and governed decisions stay ahead of passive waiting.
                  </div>
                </div>
                <Link
                  href={financeHref(organizationId, "/finance/work")}
                  className="text-[8px] font-semibold text-[#8A633C]"
                >
                  Open all work →
                </Link>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-black/[0.06]">
                <div className="hidden grid-cols-[minmax(230px,1.35fr)_minmax(190px,1fr)_105px_74px] gap-3 border-b border-black/[0.05] bg-[#FCFBF8] px-3 py-2 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#969087] md:grid">
                  <span>Work</span>
                  <span>Why now</span>
                  <span>Status</span>
                  <span></span>
                </div>
                {queue.slice(0, 10).map((item) => (
                  <Link
                    key={item.id}
                    href={financeHref(organizationId, item.href)}
                    className="group grid gap-2 border-b border-black/[0.05] px-3 py-3 last:border-0 hover:bg-[#FCFAF6] md:grid-cols-[minmax(230px,1.35fr)_minmax(190px,1fr)_105px_74px] md:items-center md:gap-3"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          item.priority === "attention" ? "bg-[#A9543F]" : "bg-[#A37849]"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-[9px] font-semibold text-[#403C37]">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[7px] uppercase tracking-[0.08em] text-[#A09A92]">
                          {titleCase(item.kind)}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 truncate text-[8px] text-[#807A72]">
                      {item.detail || evidenceForKind(item.kind)}
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.06em] ${
                          item.priority === "attention"
                            ? "border-red-700/15 bg-red-50 text-red-800"
                            : "border-amber-700/15 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {titleCase(item.status || item.priority)}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#8A633C]">
                        Open <ArrowRight size={8} />
                      </span>
                    </div>
                  </Link>
                ))}
                {!queue.length ? (
                  <div className="flex items-center gap-2 px-4 py-8 text-[9px] text-[#65715F]">
                    <BadgeCheck size={13} /> Nothing currently requires intervention.
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="rounded-[22px] border border-[#A37849]/18 bg-[#FBF8F3] p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">
                  <Sparkles size={10} /> Finance intelligence
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${
                    intelligence.grounded
                      ? "border-emerald-700/15 bg-emerald-50 text-emerald-800"
                      : "border-amber-700/15 bg-amber-50 text-amber-800"
                  }`}
                >
                  {intelligence.grounded ? "Evidence-backed" : "Source warning"}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                  What matters first
                </div>
                <div className="mt-1.5 text-[15px] font-semibold leading-5 tracking-[-0.02em] text-[#342F2A]">
                  {intelligence.title}
                </div>
                <p className="mt-2 text-[9px] leading-4 text-[#766F67]">{intelligence.detail}</p>
              </div>

              <div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-3">
                <div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#99928A]">
                  Why this recommendation is grounded
                </div>
                <div className="mt-1.5 flex items-start gap-2 text-[8px] leading-4 text-[#635D56]">
                  <ShieldCheck size={10} className="mt-0.5 shrink-0 text-[#8A633C]" />
                  <span>{intelligence.evidence}</span>
                </div>
              </div>

              <Link
                href={financeHref(organizationId, intelligence.href)}
                className="mt-4 inline-flex h-9 w-full items-center justify-between rounded-xl bg-[#25231F] px-3 text-[8px] font-semibold text-white"
              >
                <span>{intelligence.action}</span>
                <ArrowRight size={10} />
              </Link>

              <div className="mt-4 border-t border-black/[0.06] pt-3">
                <SourceTrust intelligence={intelligence} />
              </div>
            </aside>
          </div>

          <section>
            <div className="mb-2">
              <div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A867F]">
                Financial truth
              </div>
              <div className="mt-0.5 text-[8px] text-[#918B83]">
                Balances remain accessible, but human control work stays above them.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MetricCard
                label="Receivables"
                value={money(metrics.receivables?.amount, currency)}
                detail={`${metrics.receivables?.count || 0} open · ${metrics.receivables?.overdue || 0} overdue`}
                icon={CircleDollarSign}
                warning={(metrics.receivables?.overdue || 0) > 0}
                href={financeHref(organizationId, "/finance/ar")}
              />
              <MetricCard
                label="Payables"
                value={money(metrics.payables?.amount, currency)}
                detail={`${metrics.payables?.count || 0} open · ${metrics.payables?.overdue || 0} overdue`}
                icon={Banknote}
                warning={(metrics.payables?.overdue || 0) > 0}
                href={financeHref(organizationId, "/finance/ap")}
              />
              <MetricCard
                label="Reconciliation"
                value={String(metrics.reconciliation?.count || 0)}
                detail={`${money(metrics.reconciliation?.difference, currency)} difference`}
                icon={Landmark}
                warning={(metrics.reconciliation?.count || 0) > 0}
                href={financeHref(organizationId, "/finance/bank-reconciliation")}
              />
              <MetricCard
                label="Review"
                value={String(metrics.review?.count || 0)}
                detail={`${metrics.review?.ready || 0} ready · ${metrics.review?.changes_requested || 0} changes`}
                icon={ClipboardCheck}
                warning={(metrics.review?.ready || 0) > 0 || (metrics.review?.changes_requested || 0) > 0}
                href={financeHref(organizationId, "/finance/review")}
              />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A867F]">
                    Close
                  </div>
                  <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">
                    Period completion
                  </h2>
                  <div className="mt-0.5 text-[8px] text-[#918B83]">
                    Only incomplete close work stays prominent.
                  </div>
                </div>
                <Link
                  href={financeHref(organizationId, "/finance/close")}
                  className="text-[8px] font-semibold text-[#8A633C]"
                >
                  Open close →
                </Link>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-[8px]">
                <span className="font-semibold text-[#514E48]">
                  {titleCase(metrics.close?.status || "not started")}
                </span>
                <span className="tabular-nums text-[#756F67]">
                  {close.completed || 0}/{close.total || 0} · {close.progress || 0}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div
                  className="h-full rounded-full bg-[#A37849]"
                  style={{ width: `${Math.max(0, Math.min(100, close.progress || 0))}%` }}
                />
              </div>
              <div className="mt-3 divide-y divide-black/[0.055]">
                {(close.steps || [])
                  .filter((step) => !step.complete)
                  .slice(0, 5)
                  .map((step) => (
                    <Link
                      key={step.id}
                      href={financeHref(organizationId, "/finance/close")}
                      className="group flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#B18150]" />
                        <div className="min-w-0">
                          <div className="truncate text-[9px] font-semibold text-[#403C37]">
                            {step.label}
                          </div>
                          <div className="mt-0.5 text-[7px] text-[#918B83]">
                            {titleCase(step.status || "Open")}
                            {step.has_evidence ? " · Evidence attached" : " · Evidence not attached"}
                          </div>
                        </div>
                      </div>
                      <ChevronRight
                        size={10}
                        className="text-[#B0ABA3] group-hover:text-[#A37849]"
                      />
                    </Link>
                  ))}
                {(close.steps || []).filter((step) => !step.complete).length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-[8px] text-[#65715F]">
                    <CheckCircle2 size={12} /> No incomplete close steps.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[22px] border border-black/[0.07] bg-white p-4 md:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A867F]">
                    Team continuity
                  </div>
                  <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">
                    Resume without asking around
                  </h2>
                  <div className="mt-0.5 text-[8px] text-[#918B83]">
                    Latest governed accounting procedures, ownership and due context.
                  </div>
                </div>
                <Link
                  href={financeHref(organizationId, "/finance/work")}
                  className="text-[8px] font-semibold text-[#8A633C]"
                >
                  Open work →
                </Link>
              </div>
              <div className="mt-3 divide-y divide-black/[0.055]">
                {recentWork.map((item) => (
                  <Link
                    key={item.id}
                    href={financeHref(organizationId, item.href)}
                    className="group flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[9px] font-semibold text-[#403C37]">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[7px] text-[#918B83]">
                        <span className="truncate">{item.client_name}</span>
                        <span>· {titleCase(item.status)}</span>
                        {item.required_role ? <span>· {titleCase(item.required_role)}</span> : null}
                        {item.due_at ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock size={7} /> {shortDate(item.due_at)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight
                      size={10}
                      className="shrink-0 text-[#B0ABA3] group-hover:text-[#A37849]"
                    />
                  </Link>
                ))}
                {!recentWork.length ? (
                  <div className="flex items-center gap-2 py-4 text-[8px] text-[#918B83]">
                    <Clock3 size={10} /> Recent governed work will appear here as procedures are updated.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
