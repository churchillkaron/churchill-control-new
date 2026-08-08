"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const REVIEWABLE_STATUSES = new Set(["GENERATED", "RECALCULATED"]);

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
}

function dateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function StaffEarningsPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [disputeId, setDisputeId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff/profile-overview", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load payroll history");
      }

      setProfile(result.profile || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payroll history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const payroll = profile?.payroll || [];
  const currency =
    profile?.compensation?.currency_code ||
    profile?.compensation?.currency ||
    "";

  const summary = useMemo(() => {
    return {
      records: payroll.length,
      paid: payroll.filter((row) => row.status === "PAID").length,
      review: payroll.filter(
        (row) =>
          REVIEWABLE_STATUSES.has(row.status) &&
          !row.employee_acknowledged &&
          !row.employee_dispute
      ).length,
      totalPaid: payroll
        .filter((row) => row.status === "PAID")
        .reduce((sum, row) => sum + Number(row.final_salary || 0), 0),
    };
  }, [payroll]);

  async function acknowledge(record) {
    setWorkingId(record.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/staff/payroll/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollRecordId: record.id }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to acknowledge payroll");
      }

      setMessage(`Payroll ${record.payroll_month} acknowledged.`);
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to acknowledge payroll");
    } finally {
      setWorkingId("");
    }
  }

  async function dispute(record) {
    if (!disputeReason.trim()) {
      setError("Enter the reason for the payroll dispute.");
      return;
    }

    setWorkingId(record.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/staff/payroll/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollRecordId: record.id,
          disputeReason: disputeReason.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to dispute payroll");
      }

      setMessage(`Payroll ${record.payroll_month} dispute submitted.`);
      setDisputeId("");
      setDisputeReason("");
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to dispute payroll");
    } finally {
      setWorkingId("");
    }
  }

  async function openPayslip(record) {
    setWorkingId(record.id);
    setError("");

    try {
      const response = await fetch("/api/payroll/payslip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollRecordId: record.id }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to generate payslip");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (actionError) {
      setError(actionError?.message || "Unable to generate payslip");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-5 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link
                href="/staff"
                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" /> Staff portal
              </Link>
              <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <ShieldCheck className="h-4 w-4" /> Personal Payroll
              </div>
              <h1 className="mt-3 text-4xl font-black">My Earnings</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Review the exact payroll records used by management, Finance and your final payslip. Acknowledge correct payroll or raise a dispute before approval.
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Payroll Records" value={summary.records} />
          <Metric label="Awaiting Review" value={summary.review} />
          <Metric label="Paid Periods" value={summary.paid} />
          <Metric label="Total Paid" value={money(summary.totalPaid, currency)} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
        ) : null}

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">Loading payroll history...</section>
        ) : payroll.length ? (
          <section className="space-y-4">
            {payroll.map((record) => {
              const canReview = REVIEWABLE_STATUSES.has(record.status);
              const disputed = Boolean(record.employee_dispute && !record.dispute_resolved);
              const acknowledged = Boolean(record.employee_acknowledged);
              const paid = record.status === "PAID";

              return (
                <article key={record.id} className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-black">{record.payroll_month}</h2>
                        <StatusBadge value={record.status} />
                        <StatusBadge value={record.payout_status || "PENDING"} muted />
                      </div>
                      <div className="mt-3 text-3xl font-black text-[#D6A66A]">{money(record.final_salary, currency)}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/25">Net salary</div>
                    </div>

                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-4">
                      <Metric label="Gross" value={money(record.gross_salary, currency)} compact />
                      <Metric label="Deductions" value={money(record.deductions, currency)} compact />
                      <Metric label="Tax" value={money(record.tax_amount, currency)} compact />
                      <Metric label="Social Security" value={money(record.social_security, currency)} compact />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="Base salary" value={money(record.base_salary, currency)} />
                    <Info label="Overtime" value={money(record.overtime_pay, currency)} />
                    <Info label="Service charge" value={money(record.service_charge_bonus, currency)} />
                    <Info label="Worked hours" value={Number(record.worked_hours || 0).toFixed(2)} />
                  </div>

                  {paid ? (
                    <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> Paid
                      </div>
                      <div className="mt-2 text-sm text-emerald-100">
                        {record.payout_date || "Payment date unavailable"}
                        {record.payment_reference ? ` · Reference ${record.payment_reference}` : ""}
                      </div>
                    </div>
                  ) : null}

                  {acknowledged ? (
                    <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.07] p-4 text-sm text-cyan-100">
                      Payroll acknowledged {record.employee_acknowledged_at ? dateTime(record.employee_acknowledged_at) : ""}.
                    </div>
                  ) : null}

                  {record.employee_dispute ? (
                    <div className={`mt-5 rounded-2xl border p-4 ${disputed ? "border-amber-500/20 bg-amber-500/[0.08]" : "border-white/10 bg-white/[0.03]"}`}>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-200">
                        <AlertTriangle className="h-4 w-4" /> {disputed ? "Dispute open" : "Dispute resolved"}
                      </div>
                      <p className="mt-2 text-sm text-white/55">{record.employee_dispute}</p>
                    </div>
                  ) : null}

                  {disputeId === record.id && canReview && !acknowledged && !disputed ? (
                    <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                      <label className="block">
                        <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-amber-200/70">What is incorrect?</span>
                        <textarea
                          value={disputeReason}
                          onChange={(event) => setDisputeReason(event.target.value)}
                          rows={3}
                          placeholder="Describe the payroll issue clearly for management."
                          className="w-full rounded-xl border border-white/10 bg-black/25 p-4 text-sm outline-none placeholder:text-white/20"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => dispute(record)}
                          disabled={workingId === record.id}
                          className="h-10 rounded-xl bg-amber-300 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                        >
                          Submit dispute
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDisputeId("");
                            setDisputeReason("");
                          }}
                          className="h-10 rounded-xl border border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
                    {canReview && !acknowledged && !disputed ? (
                      <button
                        type="button"
                        onClick={() => acknowledge(record)}
                        disabled={workingId === record.id}
                        className="h-11 rounded-xl bg-[#D6A66A] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                      >
                        Acknowledge payroll
                      </button>
                    ) : null}

                    {canReview && !acknowledged && !disputed ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDisputeId(record.id);
                          setDisputeReason("");
                        }}
                        className="h-11 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200"
                      >
                        Dispute payroll
                      </button>
                    ) : null}

                    {paid ? (
                      <button
                        type="button"
                        onClick={() => openPayslip(record)}
                        disabled={workingId === record.id}
                        className="flex h-11 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200 disabled:opacity-40"
                      >
                        <FileText className="h-4 w-4" /> Payslip
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-8 text-center">
            <Banknote className="mx-auto h-8 w-8 text-white/25" />
            <h2 className="mt-4 text-xl font-black">No payroll records yet</h2>
            <p className="mt-2 text-sm text-white/35">Your payroll history will appear here after payroll is generated.</p>
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, compact = false }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-black/20 ${compact ? "p-3" : "p-5"}`}>
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className={`mt-2 font-black ${compact ? "text-sm" : "text-xl"}`}>{value}</div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[9px] uppercase tracking-[0.14em] text-white/25">{label}</div>
      <div className="mt-1 text-sm font-bold text-white/65">{value}</div>
    </div>
  );
}

function StatusBadge({ value, muted = false }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${muted ? "border-white/10 bg-white/[0.04] text-white/45" : "border-[#D6A66A]/20 bg-[#D6A66A]/10 text-[#E8BE83]"}`}>
      {value || "-"}
    </span>
  );
}
