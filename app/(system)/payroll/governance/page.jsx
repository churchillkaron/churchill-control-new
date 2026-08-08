"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function canApprove(record) {
  return ["GENERATED", "RECALCULATED"].includes(record?.status);
}

function canReject(record) {
  return ["GENERATED", "RECALCULATED"].includes(record?.status);
}

export default function PayrollGovernancePage() {
  const [payroll, setPayroll] = useState([]);
  const [role, setRole] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  async function loadPayroll() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/payroll/governance", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load payroll governance");
      }

      setPayroll(result.payroll || []);
      setRole(result.role || "");
      setOrganizationId(result.organizationId || "");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payroll governance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayroll();
  }, []);

  const summary = useMemo(() => {
    return payroll.reduce(
      (result, record) => {
        result.total += Number(record.final_salary || 0);
        if (["GENERATED", "RECALCULATED"].includes(record.status)) result.pending += 1;
        if (record.status === "APPROVED") result.approved += 1;
        if (record.status === "DISPUTED") result.disputed += 1;
        return result;
      },
      { total: 0, pending: 0, approved: 0, disputed: 0 }
    );
  }, [payroll]);

  async function executeAction({ action, payrollRecordId, reason = "" }) {
    setWorkingId(payrollRecordId);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/payroll/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          payrollRecordId,
          reason,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to execute payroll action");
      }

      setMessage(action === "APPROVE" ? "Payroll approved." : "Payroll rejected.");
      setRejectingId("");
      setRejectReason("");
      await loadPayroll();
    } catch (actionError) {
      setError(actionError?.message || "Unable to execute payroll action");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-cyan-300">
                <ShieldCheck className="h-4 w-4" /> Payroll Governance
              </div>
              <h1 className="mt-3 text-4xl font-black">Manager Review</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/45">
                Review the same payroll records employees see in the Workforce Portal. Approval and rejection execute only through the authenticated organization boundary.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {organizationId ? `Organization ${organizationId}` : "Organization context"} · {role || "Role"}
              </div>
            </div>

            <button
              type="button"
              onClick={loadPayroll}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Payroll Total" value={`฿${money(summary.total)}`} />
          <Metric label="Needs Review" value={summary.pending} />
          <Metric label="Approved" value={summary.approved} />
          <Metric label="Disputed" value={summary.disputed} />
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">
            Loading payroll governance...
          </section>
        ) : payroll.length ? (
          <section className="space-y-4">
            {payroll.map((record) => (
              <article
                key={record.id}
                className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black">{record.staff_name || "Employee"}</h2>
                      <StatusBadge status={record.status} />
                    </div>
                    <div className="mt-2 text-sm text-white/40">
                      {record.role || "-"} · {record.payroll_month || "-"}
                    </div>
                  </div>

                  <div className="text-left lg:text-right">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">Net Salary</div>
                    <div className="mt-2 text-3xl font-black text-emerald-300">฿{money(record.final_salary)}</div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <Data label="Gross" value={`฿${money(record.gross_salary)}`} />
                  <Data label="Base" value={`฿${money(record.base_salary)}`} />
                  <Data label="Service Charge" value={`฿${money(record.service_charge_bonus)}`} />
                  <Data label="Deductions" value={`฿${money(record.deductions)}`} />
                  <Data label="Hours" value={Number(record.worked_hours || record.total_hours || 0).toFixed(2)} />
                  <Data label="Late" value={`${Number(record.total_late_minutes || 0)} min`} />
                </div>

                {record.employee_dispute && !record.dispute_resolved ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-amber-200">
                      <AlertTriangle className="h-4 w-4" /> Employee dispute
                    </div>
                    <div className="mt-2 text-sm text-amber-100/65">{record.employee_dispute}</div>
                  </div>
                ) : null}

                {record.employee_acknowledged ? (
                  <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> Employee acknowledged
                  </div>
                ) : null}

                {rejectingId === record.id ? (
                  <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Reason for rejection"
                      className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/30"
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId("");
                          setRejectReason("");
                        }}
                        className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black uppercase tracking-[0.14em]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!rejectReason.trim() || workingId === record.id}
                        onClick={() =>
                          executeAction({
                            action: "REJECT",
                            payrollRecordId: record.id,
                            reason: rejectReason.trim(),
                          })
                        }
                        className="h-11 flex-1 rounded-xl bg-red-400 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                      >
                        Confirm rejection
                      </button>
                    </div>
                  </div>
                ) : null}

                {(canApprove(record) || canReject(record)) && rejectingId !== record.id ? (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    {canApprove(record) ? (
                      <button
                        type="button"
                        disabled={workingId === record.id || Boolean(record.employee_dispute && !record.dispute_resolved)}
                        onClick={() =>
                          executeAction({
                            action: "APPROVE",
                            payrollRecordId: record.id,
                          })
                        }
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve payroll
                      </button>
                    ) : null}

                    {canReject(record) ? (
                      <button
                        type="button"
                        disabled={workingId === record.id}
                        onClick={() => setRejectingId(record.id)}
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-black uppercase tracking-[0.16em] text-red-300 disabled:opacity-40"
                      >
                        <XCircle className="h-4 w-4" /> Reject payroll
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">
            No payroll records are available for this organization.
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
    </div>
  );
}

function Data({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className="mt-2 text-sm font-black text-white/75">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const value = String(status || "GENERATED").toUpperCase();
  const tone =
    value === "APPROVED"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : value === "DISPUTED"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : value === "REJECTED"
          ? "border-red-500/20 bg-red-500/10 text-red-300"
          : "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";

  return (
    <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${tone}`}>
      {value}
    </span>
  );
}
