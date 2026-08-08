"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

function money(value, currency = "") {
  const amount = Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${currency} ${amount}` : amount;
}

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return value || "-";

  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function maskAccount(value) {
  const text = String(value || "").replace(/\s+/g, "");
  if (!text) return "Not configured";
  if (text.length <= 4) return text;
  return `•••• ${text.slice(-4)}`;
}

export default function PayrollPaymentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [references, setReferences] = useState({});

  async function loadPayments() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/payroll/payments", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load payroll payments");
      }

      setData(result);

      if (!selectedMonth && result.lockedMonths?.length) {
        setSelectedMonth(result.lockedMonths[0]);
      }

      const bankTransferAvailable = result.paymentMethods?.some(
        (method) => method.payment_method === "bank_transfer"
      );

      if (!bankTransferAvailable && result.paymentMethods?.length) {
        setPaymentMethod(result.paymentMethods[0].payment_method);
      }
    } catch (loadError) {
      setError(loadError?.message || "Unable to load payroll payments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, []);

  const currency =
    data?.paymentMethods?.find((method) => method.payment_method === paymentMethod)?.currency ||
    data?.entity?.currency ||
    "";

  const lockedForMonth = useMemo(
    () =>
      (data?.lockedPayroll || []).filter(
        (record) => record.payroll_month === selectedMonth
      ),
    [data, selectedMonth]
  );

  const lockedTotal = useMemo(
    () =>
      lockedForMonth.reduce(
        (sum, record) => sum + Number(record.final_salary || 0),
        0
      ),
    [lockedForMonth]
  );

  const summary = useMemo(() => {
    const payments = data?.payments || [];

    return {
      prepared: payments.filter((payment) => payment.status === "PREPARED").length,
      paid: payments.filter((payment) => payment.status === "PAID").length,
      paidTotal: payments
        .filter((payment) => payment.status === "PAID")
        .reduce((sum, payment) => sum + Number(payment.total_amount || 0), 0),
    };
  }, [data]);

  async function prepareBatch() {
    if (!selectedMonth) {
      setError("Select a locked payroll month first.");
      return;
    }

    setWorking("prepare");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/payroll/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PREPARE",
          payrollMonth: selectedMonth,
          paymentMethod,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to prepare payroll payment");
      }

      setMessage(
        result.result?.reused
          ? "Existing payroll payment batch loaded."
          : "Payroll payment batch prepared."
      );
      await loadPayments();
    } catch (prepareError) {
      setError(prepareError?.message || "Unable to prepare payroll payment");
    } finally {
      setWorking("");
    }
  }

  async function reconcileBatch(batch) {
    const paymentReference = String(references[batch.id] || "").trim();

    if (!paymentReference) {
      setError("Enter the bank or payment reference before reconciliation.");
      return;
    }

    setWorking(batch.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/payroll/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECONCILE",
          payrollPaymentId: batch.id,
          paymentReference,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to reconcile payroll payment");
      }

      setMessage("Payroll payment reconciled. Employee payroll is now PAID.");
      setReferences((current) => ({ ...current, [batch.id]: "" }));
      await loadPayments();
    } catch (reconcileError) {
      setError(reconcileError?.message || "Unable to reconcile payroll payment");
    } finally {
      setWorking("");
    }
  }

  return (
    <main className="min-h-screen bg-[#030303] p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.045] backdrop-blur-3xl">
          <div className="h-px bg-gradient-to-r from-transparent via-[#D6A66A] to-transparent" />

          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.34em] text-[#D6A66A]">
                <ShieldCheck className="h-4 w-4" /> Payroll · Accounting
              </div>
              <h1 className="mt-3 text-4xl font-black">Payroll Payments</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Convert locked payroll into a controlled payment batch, verify employee payout details, then reconcile against the real bank reference before payroll becomes paid.
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">
                {data?.entity?.legal_name || "Accounting entity"} · {data?.role || "Role"}
              </div>
            </div>

            <button
              type="button"
              onClick={loadPayments}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black uppercase tracking-[0.16em] text-white/70 disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Locked Payroll" value={data?.lockedPayroll?.length || 0} icon={<Users className="h-4 w-4" />} />
          <Metric label="Prepared Batches" value={summary.prepared} icon={<Banknote className="h-4 w-4" />} />
          <Metric label="Paid Batches" value={summary.paid} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Metric label="Paid Total" value={money(summary.paidTotal, currency)} icon={<BadgeCheck className="h-4 w-4" />} />
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

        <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Prepare payment</div>
              <h2 className="mt-2 text-2xl font-black">Locked payroll batch</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[650px]">
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Payroll month</span>
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/10 bg-[#111] px-4 text-sm outline-none"
                >
                  <option value="">Select month</option>
                  {(data?.lockedMonths || []).map((month) => (
                    <option key={month} value={month}>{monthLabel(month)}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Payment method</span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/10 bg-[#111] px-4 text-sm outline-none"
                >
                  {(data?.paymentMethods || []).map((method) => (
                    <option key={method.payment_method} value={method.payment_method}>
                      {method.payment_method.replaceAll("_", " ")} · {method.currency || ""}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={prepareBatch}
                disabled={working === "prepare" || !selectedMonth || !lockedForMonth.length}
                className="mt-auto h-12 rounded-xl bg-[#D6A66A] px-5 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
              >
                {working === "prepare" ? "Preparing..." : "Prepare batch"}
              </button>
            </div>
          </div>

          {selectedMonth ? (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black">{monthLabel(selectedMonth)}</div>
                  <div className="mt-1 text-xs text-white/35">{lockedForMonth.length} locked employees ready for payment</div>
                </div>
                <div className="text-xl font-black text-[#D6A66A]">{money(lockedTotal, currency)}</div>
              </div>
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">
            Loading payroll payments...
          </section>
        ) : (data?.payments || []).length ? (
          <section className="space-y-4">
            {(data?.payments || []).map((batch) => (
              <article
                key={batch.id}
                className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.035]"
              >
                <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black">{monthLabel(batch.payroll_period)}</h2>
                      <Status status={batch.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
                      <span>{String(batch.payment_method || "").replaceAll("_", " ")}</span>
                      <span>{batch.currency || ""}</span>
                      <span>{batch.payouts?.length || 0} employees</span>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <div className="text-[9px] uppercase tracking-[0.18em] text-white/30">Batch total</div>
                    <div className="mt-2 text-3xl font-black text-[#D6A66A]">{money(batch.total_amount, batch.currency)}</div>
                    {batch.payment_reference ? (
                      <div className="mt-2 text-xs text-emerald-300">Ref: {batch.payment_reference}</div>
                    ) : null}
                  </div>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {(batch.payouts || []).map((payout) => (
                    <div
                      key={payout.id}
                      className="grid gap-3 px-5 py-4 sm:grid-cols-[1.2fr_.8fr_.8fr_.7fr] sm:items-center lg:px-6"
                    >
                      <div>
                        <div className="font-black">{payout.staff_name || "Employee"}</div>
                        <div className="mt-1 text-xs text-white/30">{payout.bank_name || "No bank"}</div>
                      </div>
                      <div className="text-sm text-white/55">{maskAccount(payout.bank_account)}</div>
                      <div className="text-sm font-black">{money(payout.amount, payout.currency || batch.currency)}</div>
                      <div className="text-right">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/45">
                          {payout.payout_status || "PREPARED"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {batch.status === "PREPARED" ? (
                  <div className="border-t border-white/[0.07] p-5 lg:p-6">
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <label>
                        <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Bank / payment reference</span>
                        <div className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4">
                          <CreditCard className="h-4 w-4 text-white/30" />
                          <input
                            value={references[batch.id] || ""}
                            onChange={(event) =>
                              setReferences((current) => ({
                                ...current,
                                [batch.id]: event.target.value,
                              }))
                            }
                            placeholder="Enter confirmed transaction reference"
                            className="w-full bg-transparent text-sm outline-none placeholder:text-white/20"
                          />
                        </div>
                      </label>

                      <button
                        type="button"
                        onClick={() => reconcileBatch(batch)}
                        disabled={working === batch.id || !String(references[batch.id] || "").trim()}
                        className="mt-auto h-12 rounded-xl bg-emerald-400 px-6 text-xs font-black uppercase tracking-[0.16em] text-black disabled:opacity-40"
                      >
                        {working === batch.id ? "Reconciling..." : "Reconcile & mark paid"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 text-sm text-white/45">
            No payroll payment batches yet. Lock an approved payroll month, then prepare its payment batch here.
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/35">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-black">{value}</div>
    </div>
  );
}

function Status({ status }) {
  const value = String(status || "PREPARED").toUpperCase();
  const tone =
    value === "PAID"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : "border-[#D6A66A]/20 bg-[#D6A66A]/10 text-[#E7C78F]";

  return (
    <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${tone}`}>
      {value}
    </span>
  );
}
