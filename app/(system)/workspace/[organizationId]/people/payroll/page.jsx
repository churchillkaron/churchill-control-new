"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

function currentPayrollMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function peopleRoute(organizationId, suffix = "") {
  if (!organizationId) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}/people${suffix}`;
}

function financeRoute(organizationId, suffix = "") {
  if (!organizationId) return "#";
  return `/workspace/${encodeURIComponent(organizationId)}/finance${suffix}`;
}

function peoplePayrollRoute(organizationId, suffix = "") {
  return peopleRoute(organizationId, `/payroll${suffix}`);
}

function peopleCompensationRoute(organizationId) {
  return peopleRoute(organizationId, "/compensation");
}

function readinessAction(code, organizationId) {
  const actions = {
    PAYROLL_PERIOD_OPEN: {
      href: peopleRoute(organizationId, "/attendance"),
      label: "Review attendance",
      note: "Complete the period first; monthly payroll remains blocked until the month closes.",
    },
    NO_ACTIVE_STAFF: {
      href: peopleRoute(organizationId, "/directory"),
      label: "Open employees",
    },
    EMPLOYMENT_PERIOD_UNSUPPORTED: {
      href: peopleRoute(organizationId, "/directory"),
      label: "Review legal employer",
      note: "Monthly payroll requires a legal-employer assignment covering the full payroll month until split-period proration is supported.",
    },
    COMPENSATION_PROFILE_MISSING: {
      href: peopleCompensationRoute(organizationId),
      label: "Open compensation",
    },
    COMPENSATION_AMOUNT_MISSING: {
      href: peopleCompensationRoute(organizationId),
      label: "Set pay amounts",
    },
    COMPENSATION_CURRENCY_MISMATCH: {
      href: peopleCompensationRoute(organizationId),
      label: "Fix compensation",
    },
    SCHEDULES_MISSING: {
      href: peopleRoute(organizationId, "/scheduling"),
      label: "Open scheduling",
    },
    PAYROLL_ALREADY_LOCKED: {
      href: peoplePayrollRoute(organizationId, "/governance"),
      label: "Open governance",
    },
    SHIFT_EVIDENCE_MISSING: {
      href: peopleRoute(organizationId, "/attendance"),
      label: "Review attendance",
    },
    ATTENDANCE_EVIDENCE_MISSING: {
      href: peopleRoute(organizationId, "/attendance"),
      label: "Review attendance",
    },
    PAYMENT_METHOD_MISSING: {
      href: peoplePayrollRoute(organizationId, "/payments"),
      label: "Open payments",
    },
    PAYMENT_CURRENCY_MISMATCH: {
      href: peoplePayrollRoute(organizationId, "/payments"),
      label: "Review payment setup",
    },
    BANK_DETAILS_MISSING: {
      href: peopleCompensationRoute(organizationId),
      label: "Add bank details",
    },
    ACCOUNTING_PERIOD_NOT_OPEN: {
      href: financeRoute(organizationId, "/fiscal-periods"),
      label: "Open fiscal periods",
    },
    PAYROLL_POSTING_RULES_MISSING: {
      href: financeRoute(organizationId, "/posting-rules"),
      label: "Open posting rules",
    },
  };

  return actions[code] || null;
}

function ReadinessIssue({ item, organizationId, tone = "red" }) {
  const action = readinessAction(item.code, organizationId);
  const red = tone === "red";

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        red
          ? "border-red-500/15 bg-red-500/[0.07]"
          : "border-amber-400/15 bg-amber-400/[0.06]"
      }`}
    >
      <div className="flex gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${red ? "text-red-300" : "text-amber-300"}`}
        />
        <div>
          <div
            className={`text-[10px] font-black uppercase tracking-[0.14em] ${
              red ? "text-red-300" : "text-amber-300"
            }`}
          >
            {item.code.replaceAll("_", " ")}
          </div>
          <div className={`mt-1 text-sm ${red ? "text-red-100/75" : "text-amber-100/70"}`}>
            {item.message}
          </div>
          {action?.note ? (
            <div className={`mt-1 text-xs ${red ? "text-red-100/45" : "text-amber-100/45"}`}>
              {action.note}
            </div>
          ) : null}
        </div>
      </div>
      {action ? (
        <Link
          href={action.href}
          className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${
            red
              ? "border-red-300/20 bg-red-300/[0.08] text-red-100 hover:bg-red-300/[0.14]"
              : "border-amber-300/20 bg-amber-300/[0.08] text-amber-100 hover:bg-amber-300/[0.14]"
          }`}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export default function PayrollPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();
  const [governance, setGovernance] = useState(null);
  const [payments, setPayments] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [loading, setLoading] = useState(true);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    const organizationQuery = `organizationId=${encodeURIComponent(organizationId)}`;

    try {
      const [governanceResponse, paymentsResponse] = await Promise.all([
        fetch(`/api/payroll/governance?${organizationQuery}`, { cache: "no-store" }),
        fetch(`/api/payroll/payments?${organizationQuery}`, { cache: "no-store" }),
      ]);

      const [governanceResult, paymentsResult] = await Promise.all([
        governanceResponse.json(),
        paymentsResponse.json(),
      ]);

      if (!governanceResponse.ok || !governanceResult?.success) {
        throw new Error(governanceResult?.error || "Unable to load payroll governance");
      }

      setGovernance(governanceResult);

      if (paymentsResponse.ok && paymentsResult?.success) {
        setPayments(paymentsResult);
      } else if (paymentsResponse.status === 403) {
        setPayments({
          restricted: true,
          role: governanceResult.role || null,
          entity: null,
          payments: [],
          lockedPayroll: [],
          lockedMonths: [],
          paymentMethods: [],
        });
      } else {
        throw new Error(paymentsResult?.error || "Unable to load payroll payments");
      }
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payroll");
    } finally {
      setLoading(false);
    }
  }

  async function loadReadiness(month = payrollMonth) {
    if (!organizationId || !/^\d{4}-\d{2}$/.test(month)) return;

    setReadinessLoading(true);

    try {
      const response = await fetch(
        `/api/payroll/readiness?organizationId=${encodeURIComponent(organizationId)}&payrollMonth=${encodeURIComponent(month)}`,
        { cache: "no-store" }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load payroll readiness");
      }

      setReadiness(result.readiness || null);
    } catch (readinessError) {
      setReadiness(null);
      setError(readinessError?.message || "Unable to load payroll readiness");
    } finally {
      setReadinessLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  useEffect(() => {
    loadReadiness(payrollMonth);
  }, [organizationId, payrollMonth]);

  const summary = useMemo(() => {
    const rows = governance?.payroll || [];
    const paymentRows = payments?.payments || [];

    return {
      records: rows.length,
      acknowledged: rows.filter((row) => row.employee_acknowledged).length,
      approved: rows.filter((row) => row.status === "APPROVED").length,
      locked: rows.filter((row) => row.status === "LOCKED").length,
      paid: rows.filter((row) => row.status === "PAID").length,
      payrollTotal: rows.reduce((sum, row) => sum + Number(row.final_salary || 0), 0),
      preparedBatches: paymentRows.filter((row) => row.status === "PREPARED").length,
      paidBatches: paymentRows.filter((row) => row.status === "PAID").length,
    };
  }, [governance, payments]);

  async function refreshAll() {
    await Promise.all([load(), loadReadiness(payrollMonth)]);
  }

  async function generatePayroll() {
    if (!organizationId) {
      setError("Organization context is required.");
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      setError("Payroll month must use YYYY-MM.");
      return;
    }

    if (!readiness?.canGenerate) {
      setError("Resolve the payroll readiness blockers before generating payroll.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/payroll/generate?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payrollMonth }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result?.success) {
        if (result?.readiness) setReadiness(result.readiness);
        throw new Error(result?.error || "Unable to generate payroll");
      }

      setMessage(`Payroll generated for ${payrollMonth}.`);
      await refreshAll();
    } catch (generateError) {
      setError(generateError?.message || "Unable to generate payroll");
    } finally {
      setGenerating(false);
    }
  }

  const paymentRestricted = payments?.restricted === true;
  const generationBlocked =
    generating || readinessLoading || !readiness || !readiness.canGenerate;

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <ShieldCheck className="h-4 w-4" /> People · Payroll
              </div>
              <h1 className="mt-3 text-4xl font-black">Payroll Control Center</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                One lifecycle from payroll readiness and generation to employee acknowledgement, management approval, accounting lock, payment and reconciliation.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {payments?.entity?.legal_name || "Organization payroll"} · {governance?.role || payments?.role || "Role"}
              </div>
            </div>
            <button type="button" onClick={refreshAll} disabled={loading || readinessLoading} className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Payroll Records" value={summary.records} />
          <Metric label="Acknowledged" value={summary.acknowledged} />
          <Metric label="Locked" value={summary.locked} />
          <Metric label="Paid" value={summary.paid} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-[#D6A66A]/10 p-3 text-[#D6A66A]"><Users className="h-5 w-5" /></div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Step 1</div>
                <h2 className="mt-1 text-2xl font-black">Generate Payroll</h2>
                <p className="mt-2 text-sm text-white/40">Build the monthly payroll from canonical compensation, attendance, schedules, overtime, service charge and deductions.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} className="h-12 flex-1 rounded-xl border border-white/10 bg-[#111] px-4 text-sm outline-none" />
              <button type="button" onClick={generatePayroll} disabled={generationBlocked} className="h-12 rounded-xl bg-[#D6A66A] px-6 text-xs font-black uppercase tracking-[0.16em] text-black disabled:cursor-not-allowed disabled:opacity-35">
                {generating ? "Generating..." : readinessLoading ? "Checking..." : "Generate payroll"}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Current exposure</div>
            <div className="mt-3 text-4xl font-black text-[#D6A66A]">{money(summary.payrollTotal)}</div>
            <div className="mt-1 text-xs text-white/30">Total net salary across loaded payroll records</div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Mini label="Approved" value={summary.approved} />
              <Mini label="Prepared Batches" value={summary.preparedBatches} />
              <Mini label="Paid Batches" value={summary.paidBatches} />
              <Mini label="Locked Ready" value={payments?.lockedPayroll?.length || 0} />
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className={`rounded-2xl p-3 ${readiness?.canGenerate ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                {readiness?.canGenerate ? <CheckCircle2 className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Generation readiness · {payrollMonth}</div>
                <h2 className="mt-1 text-2xl font-black">
                  {readinessLoading ? "Checking payroll inputs" : readiness?.canGenerate ? "Ready to generate" : "Action required before payroll"}
                </h2>
                <p className="mt-2 text-sm text-white/40">
                  Payroll generation is blocked until legal-employer scope, compensation, schedule coverage and period-close inputs are complete.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={peopleRoute(organizationId, "/directory")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">Employees</Link>
              <Link href={peopleCompensationRoute(organizationId)} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">Compensation</Link>
              <Link href={peopleRoute(organizationId, "/scheduling")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">Scheduling</Link>
              <Link href={peopleRoute(organizationId, "/attendance")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">Attendance</Link>
            </div>
          </div>

          {readiness ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Mini label="Active Staff" value={readiness.summary?.activeStaff || 0} />
                <Mini label="Paid Staff" value={readiness.summary?.paidStaff || 0} />
                <Mini label="Scheduled Staff" value={readiness.summary?.scheduledStaff || 0} />
                <Mini label="Shift Staff" value={readiness.summary?.shiftStaff || 0} />
                <Mini label="Attendance Staff" value={readiness.summary?.attendanceStaff || 0} />
              </div>

              {readiness.blockers?.length ? (
                <div className="mt-5 space-y-2">
                  {readiness.blockers.map((item) => (
                    <ReadinessIssue key={item.code} item={item} organizationId={organizationId} tone="red" />
                  ))}
                </div>
              ) : null}

              {readiness.warnings?.length ? (
                <div className="mt-3 space-y-2">
                  {readiness.warnings.map((item) => (
                    <ReadinessIssue key={item.code} item={item} organizationId={organizationId} tone="amber" />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className={`rounded-2xl p-3 ${readiness?.canCompleteLifecycle ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                {readiness?.canCompleteLifecycle ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">End-to-end lifecycle readiness</div>
                <h2 className="mt-1 text-2xl font-black">
                  {readinessLoading ? "Checking Finance and payment controls" : readiness?.canCompleteLifecycle ? "Full payroll lifecycle ready" : "Lifecycle setup still required"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-white/40">
                  These controls do not stop calculation unless required, but they must be complete before payroll can safely reach payment, Finance posting, finalization and archive.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={peoplePayrollRoute(organizationId, "/payments")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">Payments</Link>
              <Link href={financeRoute(organizationId, "/fiscal-periods")} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">Fiscal Periods</Link>
            </div>
          </div>

          {readiness ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Mini label="Pay Configured" value={readiness.summary?.paidStaff || 0} />
                <Mini label="Bank Missing" value={readiness.summary?.bankDetailsMissing || 0} />
                <Mini label="Payment Methods" value={readiness.summary?.paymentMethods || 0} />
                <Mini label="Posting Rules" value={readiness.summary?.payrollPostingRules || 0} />
                <Mini label="Finance Period" value={readiness.summary?.openAccountingPeriod ? "Open" : "Blocked"} />
              </div>

              {readiness.lifecycleBlockers?.length ? (
                <div className="mt-5 space-y-2">
                  {readiness.lifecycleBlockers.map((item) => (
                    <ReadinessIssue key={item.code} item={item} organizationId={organizationId} tone="amber" />
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100/75">
                  Payment configuration, employee payout data, Finance period and payroll posting rules are ready for the full lifecycle.
                </div>
              )}
            </>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Link href={peoplePayrollRoute(organizationId, "/governance")} className="group rounded-[30px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.04] lg:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300"><ClipboardCheck className="h-5 w-5" /></div>
              <div><div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">Step 2–3</div><h2 className="mt-1 text-2xl font-black">Governance</h2></div>
            </div>
            <p className="mt-4 text-sm text-white/40">Review employee acknowledgements and disputes, approve or reject payroll, then lock approved records for accounting.</p>
            <div className="mt-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300"><CheckCircle2 className="h-4 w-4" /> Open governance</div>
          </Link>

          {paymentRestricted ? (
            <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5 lg:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/5 p-3 text-white/35"><Banknote className="h-5 w-5" /></div>
                <div><div className="text-[10px] uppercase tracking-[0.22em] text-white/30">Step 4–5</div><h2 className="mt-1 text-2xl font-black text-white/50">Payments & Reconciliation</h2></div>
              </div>
              <p className="mt-4 text-sm text-white/35">Payment execution is restricted to owner, accounting and payroll administration roles. Governance remains available for your role.</p>
            </div>
          ) : (
            <Link href={peoplePayrollRoute(organizationId, "/payments")} className="group rounded-[30px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.04] lg:p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-300"><Banknote className="h-5 w-5" /></div>
                <div><div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/70">Step 4–5</div><h2 className="mt-1 text-2xl font-black">Payments & Reconciliation</h2></div>
              </div>
              <p className="mt-4 text-sm text-white/40">Prepare locked payroll for bank payment, verify employee bank snapshots, reconcile against the real transaction reference and mark payroll paid.</p>
              <div className="mt-5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-300"><Banknote className="h-4 w-4" /> Open payments</div>
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5"><div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div><div className="mt-3 text-3xl font-black">{value}</div></div>;
}

function Mini({ label, value }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3"><div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div><div className="mt-2 text-xl font-black">{value}</div></div>;
}
