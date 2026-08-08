"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Receipt,
  TrendingUp,
  MinusCircle,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  FileDown,
  RefreshCw,
} from "lucide-react";

function currencyCode(profile, payroll) {
  return (
    payroll?.currency_code ||
    payroll?.payroll_currency ||
    profile?.compensation?.currency_code ||
    profile?.staff?.payroll_currency ||
    ""
  );
}

function formatMoney(value, code) {
  const amount = Number(value || 0);
  return `${code ? `${code} ` : ""}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function canDispute(record) {
  return ["PAID"].includes(record?.status) && !record?.employee_dispute;
}

export default function PortalPayrollPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff/profile-overview", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load payroll");
      }

      setProfile(result.profile || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payroll");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const payroll = useMemo(() => profile?.payroll?.[0] || null, [profile]);
  const code = currencyCode(profile, payroll);

  const bonusValue =
    Number(payroll?.overtime_pay || 0) + Number(payroll?.leave_payout || 0);

  const rows = [
    {
      label: "Base Salary",
      value: formatMoney(payroll?.base_salary, code),
      icon: Wallet,
      tone: "text-cyan-300",
    },
    {
      label: "Service Charge",
      value: formatMoney(payroll?.service_charge_bonus, code),
      icon: TrendingUp,
      tone: "text-emerald-300",
    },
    {
      label: "Overtime + Leave",
      value: formatMoney(bonusValue, code),
      icon: CheckCircle2,
      tone: "text-fuchsia-300",
    },
    {
      label: "Deductions",
      value: formatMoney(payroll?.deductions, code),
      icon: MinusCircle,
      tone: "text-orange-300",
    },
  ];

  async function acknowledge() {
    if (!payroll?.id) return;

    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/staff/payroll/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollRecordId: payroll.id }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to acknowledge payroll");
      }

      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to acknowledge payroll");
    } finally {
      setWorking(false);
    }
  }

  async function submitDispute() {
    if (!payroll?.id || !disputeReason.trim()) return;

    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/staff/payroll/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollRecordId: payroll.id,
          disputeReason: disputeReason.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to dispute payroll");
      }

      setDisputeReason("");
      setShowDispute(false);
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Unable to dispute payroll");
    } finally {
      setWorking(false);
    }
  }

  async function openPayslip() {
    if (!payroll?.id) return;

    setWorking(true);
    setError("");

    try {
      const response = await fetch("/api/payroll/payslip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollRecordId: payroll.id }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to generate payslip");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (actionError) {
      setError(actionError?.message || "Unable to generate payslip");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[34px] border border-white/10 bg-white/[0.05] p-6 text-sm text-white/55 backdrop-blur-3xl">
        Loading payroll...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.06] shadow-[0_0_70px_rgba(34,211,238,0.12)] backdrop-blur-3xl">
        <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-400 to-fuchsia-500" />

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-300">
                Workforce Payroll
              </div>
              <div className="mt-3 text-4xl font-black">My Payroll</div>
              <div className="mt-2 text-sm text-white/45">
                Salary, service charge, overtime, deductions and payment confirmation.
              </div>
            </div>

            <button
              onClick={load}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-white/60 transition hover:text-white"
              aria-label="Refresh payroll"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 rounded-[30px] border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-emerald-300">
              <Receipt className="h-4 w-4" />
              {payroll?.payroll_month || "No payroll period"}
            </div>

            <div className="mt-3 text-4xl font-black">
              {formatMoney(payroll?.final_salary, code)}
            </div>

            <div className="mt-1 text-sm text-white/45">
              {payroll ? "Net payroll from the canonical payroll record" : "No payroll has been generated yet"}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[28px] border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        {rows.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-[30px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-3xl"
            >
              <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] ${item.tone}`}>
                <Icon className="h-4 w-4" />
                {item.label}
              </div>
              <div className="mt-4 text-2xl font-black">{item.value}</div>
            </div>
          );
        })}
      </section>

      {payroll ? (
        <section className="rounded-[34px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-black">
              <Clock3 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black">Payroll Status</div>
              <div className="mt-1 text-sm text-white/45">
                {payroll.status || "GENERATED"}
                {payroll.payout_status ? ` · ${payroll.payout_status}` : ""}
                {payroll.payment_reference ? ` · ${payroll.payment_reference}` : ""}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-white/55">
            <div className="rounded-2xl border border-white/10 p-3">
              <div className="uppercase tracking-[0.18em] text-white/35">Gross</div>
              <div className="mt-2 font-black text-white">{formatMoney(payroll.gross_salary, code)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 p-3">
              <div className="uppercase tracking-[0.18em] text-white/35">Tax + Social Security</div>
              <div className="mt-2 font-black text-white">
                {formatMoney(Number(payroll.tax_amount || 0) + Number(payroll.social_security || 0), code)}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 p-3">
              <div className="uppercase tracking-[0.18em] text-white/35">Hours</div>
              <div className="mt-2 font-black text-white">{Number(payroll.worked_hours || payroll.total_hours || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 p-3">
              <div className="uppercase tracking-[0.18em] text-white/35">Late</div>
              <div className="mt-2 font-black text-white">{Number(payroll.total_late_minutes || 0)} min</div>
            </div>
          </div>

          {payroll.employee_dispute ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              <div className="flex items-center gap-2 font-black">
                <AlertTriangle className="h-4 w-4" /> Payroll dispute
              </div>
              <div className="mt-2 text-amber-100/70">{payroll.employee_dispute}</div>
            </div>
          ) : null}

          {showDispute ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <textarea
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="Explain what is incorrect in this payroll record"
                className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/30"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowDispute(false)}
                  className="h-12 rounded-2xl border border-white/10 bg-white/[0.05] text-xs font-black uppercase tracking-[0.14em]"
                >
                  Cancel
                </button>
                <button
                  onClick={submitDispute}
                  disabled={working || !disputeReason.trim()}
                  className="h-12 rounded-2xl bg-amber-400 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                >
                  Submit dispute
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {!payroll.employee_acknowledged && !payroll.employee_dispute ? (
              <button
                onClick={acknowledge}
                disabled={working}
                className="flex h-14 w-full items-center justify-center rounded-[24px] bg-white text-sm font-black uppercase tracking-[0.2em] text-black disabled:opacity-40"
              >
                Acknowledge payroll
              </button>
            ) : null}

            {canDispute(payroll) && !showDispute ? (
              <button
                onClick={() => setShowDispute(true)}
                disabled={working}
                className="flex h-14 w-full items-center justify-center rounded-[24px] border border-amber-400/20 bg-amber-400/10 text-sm font-black uppercase tracking-[0.2em] text-amber-200 disabled:opacity-40"
              >
                Dispute payroll
              </button>
            ) : null}

            <button
              onClick={openPayslip}
              disabled={working}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[24px] border border-white/10 bg-white/[0.06] text-sm font-black uppercase tracking-[0.2em] text-white disabled:opacity-40"
            >
              <FileDown className="h-4 w-4" />
              Open payslip
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-[34px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/45 backdrop-blur-3xl">
          Payroll has not been generated for this employee yet.
        </section>
      )}
    </div>
  );
}
