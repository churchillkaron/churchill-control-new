"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
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

function formatMoney(value, currency) {
  const code = String(currency || "").trim().toUpperCase();
  return `${code ? `${code} ` : ""}${money(value)}`;
}

function canApprove(record) {
  return ["GENERATED", "RECALCULATED"].includes(record?.status);
}

function canReject(record) {
  return ["GENERATED", "RECALCULATED"].includes(record?.status);
}

function canFinalize(record) {
  return ["PAID", "RESOLVED"].includes(record?.status);
}

function canAccountingClose(record) {
  return record?.status === "FINALIZED";
}

function canCertify(record) {
  return record?.status === "ACCOUNTING_CLOSED";
}

function canArchive(record) {
  return record?.status === "CERTIFIED";
}

export default function PayrollGovernancePage() {
  const [payroll, setPayroll] = useState([]);
  const [role, setRole] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [currency, setCurrency] = useState("");
  const [capabilities, setCapabilities] = useState({
    canReview: false,
    canLock: false,
    canFinalize: false,
    canAccountingClose: false,
    canCertify: false,
    canArchive: false,
  });
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [resolvingId, setResolvingId] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [reviewingId, setReviewingId] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

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
      setCurrency(result.currency || "");
      setCapabilities(
        result.capabilities || {
          canReview: false,
          canLock: false,
          canFinalize: false,
          canAccountingClose: false,
          canCertify: false,
          canArchive: false,
        }
      );
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
        if (record.review_required === true && record.review_status === "PENDING") {
          result.review += 1;
        }
        if (["GENERATED", "RECALCULATED"].includes(record.status)) result.pending += 1;
        if (record.status === "APPROVED") result.approved += 1;
        if (["ACCOUNTING_CLOSED", "CERTIFIED", "ARCHIVED"].includes(record.status)) {
          result.terminal += 1;
        }
        return result;
      },
      { total: 0, review: 0, pending: 0, approved: 0, terminal: 0 }
    );
  }, [payroll]);

  async function executeAction({
    action,
    payrollRecordId,
    reason = "",
    resolutionNotes: notes = "",
    decision = "",
    reviewNotes: managerNotes = "",
  }) {
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
          resolutionNotes: notes,
          decision,
          notes: managerNotes,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to execute payroll action");
      }

      const messages = {
        APPROVE: "Payroll month approved.",
        REVIEW_ATTENDANCE_PENALTY: "Manager payroll review completed.",
        REJECT: "Payroll rejected.",
        RECALCULATE: "Payroll month recalculated. Employee acknowledgement is required again before approval.",
        RESOLVE_DISPUTE: "Employee payroll dispute resolved.",
        LOCK: "Payroll month locked and accrued.",
        FINALIZE: "Payroll month finalized. Post-payment disputes are now closed for this month.",
        ACCOUNTING_CLOSE: "Payroll accounting month closed.",
        CERTIFY: "Payroll month certified.",
        ARCHIVE: "Payroll month archived and is now immutable.",
      };

      setMessage(messages[action] || "Payroll updated.");
      setRejectingId("");
      setRejectReason("");
      setResolvingId("");
      setResolutionNotes("");
      setReviewingId("");
      setReviewNotes("");
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
              <h1 className="mt-3 text-4xl font-black">Payroll Lifecycle Governance</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Review, approve, lock, pay, finalize, accounting-close, certify and archive each payroll month through one controlled lifecycle.
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Payroll Total" value={formatMoney(summary.total, currency)} />
          <Metric label="Manager Review" value={summary.review} />
          <Metric label="Needs Approval" value={summary.pending} />
          <Metric label="Approved" value={summary.approved} />
          <Metric label="Close / Archive" value={summary.terminal} />
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
            {payroll.map((record) => {
              const unresolvedDispute = Boolean(
                record.employee_dispute && !record.dispute_resolved
              );
              const resolvedDispute = Boolean(
                record.employee_dispute && record.dispute_resolved
              );
              const pendingManagerReview = Boolean(
                record.review_required === true && record.review_status === "PENDING"
              );
              const acknowledgementMissing = !record.employee_acknowledged;
              const approvalBlocked =
                pendingManagerReview || unresolvedDispute || acknowledgementMissing;

              return (
                <article
                  key={record.id}
                  className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">{record.staff_name || "Employee"}</h2>
                        <StatusBadge status={record.status} />
                        {record.review_required ? (
                          <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${pendingManagerReview ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
                            Review {record.review_status || "PENDING"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm text-white/40">
                        {record.role || "-"} · {record.payroll_month || "-"}
                      </div>
                    </div>

                    <div className="text-left lg:text-right">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">Net Salary</div>
                      <div className="mt-2 text-3xl font-black text-emerald-300">{formatMoney(record.final_salary, currency)}</div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                    <Data label="Gross" value={formatMoney(record.gross_salary, currency)} />
                    <Data label="Base" value={formatMoney(record.base_salary, currency)} />
                    <Data label="Service Charge" value={formatMoney(record.service_charge_bonus, currency)} />
                    <Data label="Deductions" value={formatMoney(record.deductions, currency)} />
                    <Data label="Attendance" value={formatMoney(record.attendance_penalty, currency)} />
                    <Data label="Hours" value={Number(record.worked_hours || record.total_hours || 0).toFixed(2)} />
                    <Data label="Late" value={`${Number(record.total_late_minutes || 0)} min`} />
                  </div>

                  {pendingManagerReview ? (
                    <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
                      <div className="flex items-center gap-2 text-sm font-black text-amber-200">
                        <AlertTriangle className="h-4 w-4" /> Manager review required
                      </div>
                      <div className="mt-2 text-sm leading-6 text-amber-100/65">
                        {record.review_reason || "Payroll evidence requires manager review before employee acknowledgement."}
                      </div>
                      {Number(record.attendance_penalty || 0) > 0 ? (
                        <div className="mt-2 text-xs text-white/45">
                          Proposed attendance deduction: {formatMoney(record.attendance_penalty, currency)}. Approving keeps the proposal; waiving removes it and recalculates net payroll.
                        </div>
                      ) : null}

                      {reviewingId === record.id ? (
                        <div className="mt-4 space-y-3">
                          <textarea
                            value={reviewNotes}
                            onChange={(event) => setReviewNotes(event.target.value)}
                            placeholder="Manager notes. Required when waiving a proposed deduction."
                            className="min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/30"
                          />
                          <div className="grid gap-3 sm:grid-cols-3">
                            <button
                              type="button"
                              onClick={() => {
                                setReviewingId("");
                                setReviewNotes("");
                              }}
                              className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black uppercase tracking-[0.14em]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={workingId === record.id}
                              onClick={() =>
                                executeAction({
                                  action: "REVIEW_ATTENDANCE_PENALTY",
                                  payrollRecordId: record.id,
                                  decision: "APPROVE",
                                  reviewNotes: reviewNotes.trim(),
                                })
                              }
                              className="h-11 rounded-xl bg-emerald-300 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                            >
                              Approve review
                            </button>
                            {Number(record.attendance_penalty || 0) > 0 ? (
                              <button
                                type="button"
                                disabled={workingId === record.id || !reviewNotes.trim()}
                                onClick={() =>
                                  executeAction({
                                    action: "REVIEW_ATTENDANCE_PENALTY",
                                    payrollRecordId: record.id,
                                    decision: "WAIVE",
                                    reviewNotes: reviewNotes.trim(),
                                  })
                                }
                                className="h-11 rounded-xl border border-amber-300/25 bg-amber-300/10 text-xs font-black uppercase tracking-[0.14em] text-amber-100 disabled:opacity-40"
                              >
                                Waive deduction
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : capabilities.canReview ? (
                        <button
                          type="button"
                          disabled={workingId === record.id}
                          onClick={() => {
                            setRejectingId("");
                            setResolvingId("");
                            setReviewingId(record.id);
                            setReviewNotes("");
                          }}
                          className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-amber-300 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                        >
                          Review payroll evidence
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {record.status === "REJECTED" ? (
                    <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                      <div className="flex items-center gap-2 text-sm font-black text-red-200">
                        <XCircle className="h-4 w-4" /> Payroll rejected
                      </div>
                      <div className="mt-2 text-sm text-red-100/65">
                        {record.notes || "Correct the underlying payroll inputs, then recalculate the full payroll month."}
                      </div>
                    </div>
                  ) : null}

                  {unresolvedDispute ? (
                    <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                      <div className="flex items-center gap-2 text-sm font-black text-amber-200">
                        <AlertTriangle className="h-4 w-4" /> Employee dispute
                      </div>
                      <div className="mt-2 text-sm text-amber-100/65">{record.employee_dispute}</div>
                    </div>
                  ) : null}

                  {resolvedDispute ? (
                    <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                      <div className="flex items-center gap-2 text-sm font-black text-cyan-200">
                        <CheckCircle2 className="h-4 w-4" /> Dispute resolved
                      </div>
                      <div className="mt-2 text-sm text-cyan-100/65">{record.employee_dispute}</div>
                      {record.dispute_resolution_notes ? (
                        <div className="mt-2 text-sm text-white/45">
                          Resolution: {record.dispute_resolution_notes}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {record.accounting_period_closed ? (
                    <div className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-cyan-300">
                      Accounting closed · {record.accounting_period_closed_at || "Recorded"}
                    </div>
                  ) : null}

                  {record.payroll_certified ? (
                    <div className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                      Payroll certified · {record.payroll_certified_at || "Recorded"}
                    </div>
                  ) : null}

                  {record.archived ? (
                    <div className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-white/50">
                      Archived · {record.archived_at || "Recorded"}
                    </div>
                  ) : null}

                  {record.employee_acknowledged ? (
                    <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Employee acknowledged
                    </div>
                  ) : pendingManagerReview ? (
                    <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-300">
                      <AlertTriangle className="h-4 w-4" /> Employee acknowledgement locked until manager review
                    </div>
                  ) : canApprove(record) ? (
                    <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-300">
                      <AlertTriangle className="h-4 w-4" /> Awaiting employee acknowledgement
                    </div>
                  ) : null}

                  {resolvingId === record.id ? (
                    <div className="mt-5 space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">
                        Resolve employee dispute
                      </div>
                      <textarea
                        value={resolutionNotes}
                        onChange={(event) => setResolutionNotes(event.target.value)}
                        placeholder="Resolution notes for the employee and payroll audit trail"
                        className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/30"
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingId("");
                            setResolutionNotes("");
                          }}
                          className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-black uppercase tracking-[0.14em]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!resolutionNotes.trim() || workingId === record.id}
                          onClick={() =>
                            executeAction({
                              action: "RESOLVE_DISPUTE",
                              payrollRecordId: record.id,
                              resolutionNotes: resolutionNotes.trim(),
                            })
                          }
                          className="h-11 flex-1 rounded-xl bg-amber-300 text-xs font-black uppercase tracking-[0.14em] text-black disabled:opacity-40"
                        >
                          Confirm resolution
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {unresolvedDispute && capabilities.canResolveDispute && resolvingId !== record.id ? (
                    <button
                      type="button"
                      disabled={workingId === record.id}
                      onClick={() => {
                        setRejectingId("");
                        setRejectReason("");
                        setReviewingId("");
                        setReviewNotes("");
                        setResolvingId(record.id);
                        setResolutionNotes("");
                      }}
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs font-black uppercase tracking-[0.16em] text-amber-200 disabled:opacity-40"
                    >
                      <AlertTriangle className="h-4 w-4" /> Resolve dispute
                    </button>
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

                  {(canApprove(record) || canReject(record)) &&
                  rejectingId !== record.id &&
                  resolvingId !== record.id &&
                  reviewingId !== record.id ? (
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      {canApprove(record) ? (
                        <button
                          type="button"
                          disabled={workingId === record.id || approvalBlocked}
                          onClick={() =>
                            executeAction({
                              action: "APPROVE",
                              payrollRecordId: record.id,
                            })
                          }
                          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Approve payroll month
                        </button>
                      ) : null}

                      {canReject(record) ? (
                        <button
                          type="button"
                          disabled={workingId === record.id}
                          onClick={() => {
                            setResolvingId("");
                            setResolutionNotes("");
                            setReviewingId("");
                            setReviewNotes("");
                            setRejectingId(record.id);
                          }}
                          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-black uppercase tracking-[0.16em] text-red-300 disabled:opacity-40"
                        >
                          <XCircle className="h-4 w-4" /> Reject payroll
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {record.status === "REJECTED" && capabilities.canRecalculate ? (
                    <button
                      type="button"
                      disabled={workingId === record.id}
                      onClick={() =>
                        executeAction({
                          action: "RECALCULATE",
                          payrollRecordId: record.id,
                        })
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                    >
                      <RefreshCw className="h-4 w-4" /> Recalculate payroll month
                    </button>
                  ) : null}

                  {record.status === "APPROVED" && capabilities.canLock ? (
                    <button
                      type="button"
                      disabled={workingId === record.id}
                      onClick={() =>
                        executeAction({
                          action: "LOCK",
                          payrollRecordId: record.id,
                        })
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                    >
                      <Lock className="h-4 w-4" /> Lock payroll month
                    </button>
                  ) : null}

                  {canFinalize(record) && capabilities.canFinalize ? (
                    <button
                      type="button"
                      disabled={workingId === record.id || unresolvedDispute}
                      onClick={() =>
                        executeAction({
                          action: "FINALIZE",
                          payrollRecordId: record.id,
                        })
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Finalize payroll month
                    </button>
                  ) : null}

                  {canAccountingClose(record) && capabilities.canAccountingClose ? (
                    <button
                      type="button"
                      disabled={workingId === record.id}
                      onClick={() =>
                        executeAction({
                          action: "ACCOUNTING_CLOSE",
                          payrollRecordId: record.id,
                        })
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-xs font-black uppercase tracking-[0.16em] text-cyan-200 disabled:opacity-40"
                    >
                      <Lock className="h-4 w-4" /> Close accounting month
                    </button>
                  ) : null}

                  {canCertify(record) && capabilities.canCertify ? (
                    <button
                      type="button"
                      disabled={workingId === record.id}
                      onClick={() =>
                        executeAction({
                          action: "CERTIFY",
                          payrollRecordId: record.id,
                        })
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-xs font-black uppercase tracking-[0.16em] text-emerald-200 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Certify payroll month
                    </button>
                  ) : null}

                  {canArchive(record) && capabilities.canArchive ? (
                    <button
                      type="button"
                      disabled={workingId === record.id}
                      onClick={() =>
                        executeAction({
                          action: "ARCHIVE",
                          payrollRecordId: record.id,
                        })
                      }
                      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
                    >
                      <Lock className="h-4 w-4" /> Archive payroll month
                    </button>
                  ) : null}
                </article>
              );
            })}
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
    value === "ARCHIVED"
      ? "border-white/15 bg-white/[0.05] text-white/55"
      : value === "CERTIFIED"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
        : value === "ACCOUNTING_CLOSED"
          ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
          : value === "FINALIZED"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : value === "RESOLVED"
              ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
              : value === "DISPUTED"
                ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : value === "PAID"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : value === "LOCKED"
                    ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                    : value === "APPROVED"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                      : value === "REJECTED"
                        ? "border-red-500/20 bg-red-500/10 text-red-300"
                        : "border-white/10 bg-white/[0.05] text-white/65";

  return (
    <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${tone}`}>
      {value}
    </span>
  );
}
