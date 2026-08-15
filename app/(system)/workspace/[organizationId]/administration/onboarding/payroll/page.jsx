"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Coins,
  CreditCard,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";

function currentPayrollMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function peopleRoute(organizationId, path) {
  if (!organizationId) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}/people${path}`;
}

function financeRoute(organizationId, path) {
  if (!organizationId) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}/finance${path}`;
}

function blockerAction(code, organizationId) {
  const actions = {
    PAYROLL_PERIOD_OPEN: { href: peopleRoute(organizationId, "/attendance"), label: "Review attendance" },
    NO_ACTIVE_STAFF: { href: peopleRoute(organizationId, "/directory"), label: "Open employees" },
    PAYROLL_COUNTRY_MISSING: { href: peopleRoute(organizationId, "/payroll/policy"), label: "Configure payroll" },
    PAYROLL_CURRENCY_MISSING: { href: peopleRoute(organizationId, "/payroll/policy"), label: "Configure payroll" },
    COMPENSATION_PROFILE_MISSING: { href: peopleRoute(organizationId, "/compensation"), label: "Open compensation" },
    COMPENSATION_AMOUNT_MISSING: { href: peopleRoute(organizationId, "/compensation"), label: "Set pay amounts" },
    COMPENSATION_CURRENCY_MISMATCH: { href: peopleRoute(organizationId, "/compensation"), label: "Fix compensation" },
    SCHEDULES_MISSING: { href: peopleRoute(organizationId, "/scheduling"), label: "Open scheduling" },
    PAYROLL_ALREADY_LOCKED: { href: peopleRoute(organizationId, "/payroll/governance"), label: "Open governance" },
    SHIFT_EVIDENCE_MISSING: { href: peopleRoute(organizationId, "/attendance"), label: "Review attendance" },
    ATTENDANCE_EVIDENCE_MISSING: { href: peopleRoute(organizationId, "/attendance"), label: "Review attendance" },
    PAYMENT_METHOD_MISSING: { href: peopleRoute(organizationId, "/payroll/payments"), label: "Open payments" },
    PAYMENT_CURRENCY_MISMATCH: { href: peopleRoute(organizationId, "/payroll/payments"), label: "Review payment setup" },
    BANK_DETAILS_MISSING: { href: peopleRoute(organizationId, "/compensation"), label: "Add bank details" },
    ACCOUNTING_PERIOD_NOT_OPEN: { href: financeRoute(organizationId, "/fiscal-periods"), label: "Open fiscal periods" },
    PAYROLL_POSTING_RULES_MISSING: { href: financeRoute(organizationId, "/posting-rules"), label: "Open posting rules" },
  };

  return actions[code] || null;
}

function stageState({ readiness, errorCode, kind }) {
  if (errorCode === "LEGAL_ENTITY_MISSING") {
    return kind === "entity" ? "blocked" : "waiting";
  }
  if (!readiness) return "waiting";

  const blockers = new Set((readiness.blockers || []).map((item) => item.code));
  const lifecycleBlockers = new Set(
    (readiness.lifecycleBlockers || []).map((item) => item.code)
  );

  if (kind === "entity") return readiness.entityId ? "ready" : "blocked";
  if (kind === "settings") {
    return blockers.has("PAYROLL_COUNTRY_MISSING") || blockers.has("PAYROLL_CURRENCY_MISSING")
      ? "blocked"
      : "ready";
  }
  if (kind === "compensation") {
    return blockers.has("COMPENSATION_PROFILE_MISSING") ||
      blockers.has("COMPENSATION_AMOUNT_MISSING") ||
      blockers.has("COMPENSATION_CURRENCY_MISMATCH") ||
      lifecycleBlockers.has("BANK_DETAILS_MISSING")
      ? "blocked"
      : "ready";
  }
  if (kind === "scheduling") {
    return blockers.has("SCHEDULES_MISSING") ? "blocked" : "ready";
  }
  if (kind === "attendance") {
    const warnings = new Set((readiness.warnings || []).map((item) => item.code));
    return warnings.has("SHIFT_EVIDENCE_MISSING") || warnings.has("ATTENDANCE_EVIDENCE_MISSING")
      ? "attention"
      : readiness.summary?.scheduledStaff > 0
        ? "ready"
        : "waiting";
  }
  if (kind === "payment") {
    return lifecycleBlockers.size === 0 ? "ready" : "blocked";
  }
  if (kind === "run") {
    const generationBlockers = (readiness.blockers || []).filter(
      (item) => item.code !== "PAYROLL_PERIOD_OPEN"
    );
    return generationBlockers.length === 0 ? "ready" : "blocked";
  }

  return "waiting";
}

function getStages(organizationId) {
  return [
    {
      id: "entity",
      title: "Legal Entity",
      description: "Confirm the employing legal entity and accounting scope used by payroll.",
      href: "/finance/legal-entities",
      action: "Legal entities",
      icon: Building2,
    },
    {
      id: "settings",
      title: "Payroll Policy",
      description: "Set payroll country, currency and organization calculation rules without platform assumptions.",
      href: peopleRoute(organizationId, "/payroll/policy"),
      action: "Payroll policy",
      icon: Settings2,
    },
    {
      id: "compensation",
      title: "Compensation",
      description: "Configure effective pay, entity currency and bank-transfer destination for every payroll employee.",
      href: peopleRoute(organizationId, "/compensation"),
      action: "Compensation",
      icon: Coins,
    },
    {
      id: "scheduling",
      title: "Scheduling",
      description: "Publish work schedules when expected payroll hours are schedule-driven.",
      href: peopleRoute(organizationId, "/scheduling"),
      action: "Scheduling",
      icon: CalendarClock,
    },
    {
      id: "attendance",
      title: "Attendance Evidence",
      description: "Review clock, shift and attendance evidence before the payroll period is approved.",
      href: peopleRoute(organizationId, "/attendance"),
      action: "Attendance",
      icon: ClipboardCheck,
    },
    {
      id: "payment",
      title: "Payment Readiness",
      description: "Confirm payout destinations, payment configuration, Finance period state and payroll posting rules before settlement.",
      href: peopleRoute(organizationId, "/payroll/payments"),
      action: "Payroll payments",
      icon: CreditCard,
    },
    {
      id: "run",
      title: "Payroll Run",
      description: "Generate payroll only after configuration is complete and the payroll period has closed.",
      href: peopleRoute(organizationId, "/payroll"),
      action: "Payroll runs",
      icon: Users,
    },
  ];
}

export default function AdministrationPayrollOnboardingPage() {
  const params = useParams();
  const organizationId = params?.organizationId || null;
  const stages = useMemo(() => getStages(organizationId), [organizationId]);
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  async function loadReadiness(month = payrollMonth) {
    if (!organizationId || !/^\d{4}-\d{2}$/.test(month)) return;

    setLoading(true);
    setError("");
    setErrorCode("");

    try {
      const response = await fetch(
        `/api/payroll/readiness?organizationId=${encodeURIComponent(organizationId)}&payrollMonth=${encodeURIComponent(month)}`,
        { cache: "no-store" }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        const message = result?.error || "Unable to evaluate payroll setup";
        if (/default legal entity not configured/i.test(message)) {
          setErrorCode("LEGAL_ENTITY_MISSING");
        }
        throw new Error(message);
      }

      setReadiness(result.readiness || null);
    } catch (loadError) {
      setReadiness(null);
      setError(loadError?.message || "Unable to evaluate payroll setup");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReadiness(payrollMonth);
  }, [organizationId, payrollMonth]);

  const setupBlockers = useMemo(
    () => (readiness?.blockers || []).filter((item) => item.code !== "PAYROLL_PERIOD_OPEN"),
    [readiness]
  );

  const lifecycleBlockers = useMemo(
    () => readiness?.lifecycleBlockers || [],
    [readiness]
  );

  const requiredBlockers = useMemo(
    () => [...setupBlockers, ...lifecycleBlockers],
    [setupBlockers, lifecycleBlockers]
  );

  const setupReady = Boolean(
    readiness && readiness.entityId && requiredBlockers.length === 0
  );

  const completedStages = stages.filter(
    (stage) => stageState({ readiness, errorCode, kind: stage.id }) === "ready"
  ).length;

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                Administration · Onboarding & Setup
              </div>
              <h1 className="mt-3 text-4xl font-black">Payroll Setup</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Prepare a company for payroll using the canonical People, Finance and workforce configuration already owned by each domain. This page does not duplicate payroll master data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="month"
                value={payrollMonth}
                onChange={(event) => setPayrollMonth(event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-[#111] px-4 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => loadReadiness(payrollMonth)}
                disabled={loading}
                className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.15em] text-white/70 disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Setup" value={loading ? "Checking" : setupReady ? "Ready" : "Action required"} />
          <Metric label="Completed stages" value={`${completedStages}/${stages.length}`} />
          <Metric label="Active staff" value={readiness?.summary?.activeStaff ?? "—"} />
          <Metric label="Paid staff" value={readiness?.summary?.paidStaff ?? "—"} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              {errorCode === "LEGAL_ENTITY_MISSING" ? (
                <Link href="/finance/legal-entities" className="rounded-xl border border-red-300/20 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em]">
                  Configure legal entity
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Onboarding sequence</div>
              <h2 className="mt-1 text-2xl font-black">Payroll go-live checklist</h2>
            </div>
            <div className="text-xs text-white/35">
              Scope: {readiness?.entityId ? "legal entity resolved" : "legal entity required"}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stages.map((stage, index) => (
              <SetupStage
                key={stage.id}
                number={index + 1}
                stage={stage}
                state={stageState({ readiness, errorCode, kind: stage.id })}
              />
            ))}
          </div>
        </section>

        {readiness ? (
          <section className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
                <AlertTriangle className="h-4 w-4" /> Required setup
              </div>

              {requiredBlockers.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  All configuration and settlement prerequisites for this payroll month are complete. Period-close rules may still prevent generation while the month is open.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {requiredBlockers.map((item) => {
                    const action = blockerAction(item.code, organizationId);
                    return (
                      <div key={item.code} className="rounded-2xl border border-red-500/15 bg-red-500/[0.06] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">{item.code}</div>
                            <p className="mt-1 text-sm text-white/65">{item.message}</p>
                          </div>
                          {action ? (
                            <Link href={action.href} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                              {action.label}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Readiness evidence</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Mini label="Profiles" value={readiness.summary?.compensationProfiles || 0} />
                <Mini label="Pay missing" value={readiness.summary?.compensationUnconfigured || 0} />
                <Mini label="Schedules" value={readiness.summary?.scheduleRows || 0} />
                <Mini label="Scheduled staff" value={readiness.summary?.scheduledStaff || 0} />
                <Mini label="Shifts" value={readiness.summary?.shiftRows || 0} />
                <Mini label="Attendance" value={readiness.summary?.attendanceRows || 0} />
                <Mini label="Settlement blockers" value={lifecycleBlockers.length} />
                <Mini label="Generation blockers" value={setupBlockers.length} />
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-white/40">
                Payroll country: <span className="text-white/70">{readiness.settings?.country || "Not configured"}</span><br />
                Payroll currency: <span className="text-white/70">{readiness.settings?.currency || "Not configured"}</span><br />
                Schedule expected hours: <span className="text-white/70">{readiness.settings?.useScheduleExpectedHours ? "Enabled" : "Disabled"}</span><br />
                Timezone: <span className="text-white/70">{readiness.timezone || "—"}</span>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function SetupStage({ number, stage, state }) {
  const Icon = stage.icon;
  const ready = state === "ready";
  const blocked = state === "blocked";
  const attention = state === "attention";
  const StatusIcon = ready ? CheckCircle2 : blocked || attention ? AlertTriangle : CircleDashed;
  const statusLabel = ready ? "Ready" : blocked ? "Action required" : attention ? "Review" : "Waiting";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[#D6A66A]">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/30">Step {number}</div>
            <div className="mt-1 text-sm font-black">{stage.title}</div>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${ready ? "text-emerald-300" : blocked ? "text-red-300" : attention ? "text-amber-300" : "text-white/30"}`}>
          <StatusIcon className="h-3.5 w-3.5" /> {statusLabel}
        </div>
      </div>
      <p className="mt-4 min-h-[60px] text-xs leading-5 text-white/40">{stage.description}</p>
      <Link href={stage.href} className="mt-4 inline-flex rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65 transition hover:border-[#D6A66A]/40 hover:text-[#D6A66A]">
        {stage.action}
      </Link>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-3 text-2xl font-black">{value}</div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}
