"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
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

export default function PayrollPage() {
  const [governance, setGovernance] = useState(null);
  const [payments, setPayments] = useState(null);
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [governanceResponse, paymentsResponse] = await Promise.all([
        fetch("/api/payroll/governance", { cache: "no-store" }),
        fetch("/api/payroll/payments", { cache: "no-store" }),
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

  useEffect(() => {
    load();
  }, []);

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

  async function generatePayroll() {
    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      setError("Payroll month must use YYYY-MM.");
      return;
    }

    setGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollMonth }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to generate payroll");
      }

      setMessage(`Payroll generated for ${payrollMonth}.`);
      await load();
    } catch (generateError) {
      setError(generateError?.message || "Unable to generate payroll");
    } finally {
      setGenerating(false);
    }
  }

  const paymentRestricted = payments?.restricted === true;

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
                One lifecycle from payroll generation to employee acknowledgement, management approval, accounting lock, payment and reconciliation.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {payments?.entity?.legal_name || "Organization payroll"} · {governance?.role || payments?.role || "Role"}
              </div>
            </div>
            <button type="button" onClick={load} disabled={loading} className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40">
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
              <button type="button" onClick={generatePayroll} disabled={generating} className="h-12 rounded-xl bg-[#D6A66A] px-6 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40">
                {generating ? "Generating..." : "Generate payroll"}
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

        <section className="grid gap-4 lg:grid-cols-2">
          <Link href="/payroll/governance" className="group rounded-[30px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.04] lg:p-6">
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
            <Link href="/payroll/payments" className="group rounded-[30px] border border-white/10 bg-white/[0.035] p-5 transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.04] lg:p-6">
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
