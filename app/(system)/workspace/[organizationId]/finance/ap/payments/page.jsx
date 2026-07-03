"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function VendorPaymentRunsPage({
  params,
}) {
  const {
    organizationId,
    financeGet,
    financePost,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [payments, setPayments] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [runningId, setRunningId] =
    useState(null);

  const [message, setMessage] =
    useState(null);

  useEffect(() => {
    if (!runtimeLoading) {
      loadPayments();
    }
  }, [runtimeLoading]);

  async function loadPayments() {
    try {
      setLoading(true);

      const json =
        await financeGet(
          "/api/finance/payments/list"
        );

      setPayments(
        json.payments ||
        json.data ||
        json.rows ||
        []
      );
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.message ||
          "Unable to load payments",
      });
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  async function runPayment(payment) {
    const payableId =
      payment.accounts_payable_id ||
      payment.payable_id ||
      payment.id;

    const entityId =
      payment.entity_id ||
      payment.entityId;

    if (!entityId) {
      setMessage({
        type: "error",
        text:
          "entity_id missing on payment row",
      });
      return;
    }

    try {
      setRunningId(payment.id);

      const json =
        await financePost(
          "/api/finance/accounts-payable/pay",
          {
            organization_id:
              payment.organization_id ||
              organizationId,

            entity_id:
              entityId,

            payable_id:
              payableId,

            payment_method:
              payment.payment_method ||
              "BANK_TRANSFER",

            paid_by:
              "ACCOUNTING",
          }
        );

      if (!json.success) {
        throw new Error(
          json.error ||
          "Payment failed"
        );
      }

      setMessage({
        type: "success",
        text:
          "Vendor payment posted and GL updated",
      });

      await loadPayments();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.message ||
          "Payment failed",
      });
    } finally {
      setRunningId(null);
    }
  }

  const totals =
    useMemo(() => ({
      total:
        payments.length,

      pending:
        payments.filter(
          (p) =>
            !p.status ||
            p.status === "PENDING" ||
            p.status === "OPEN"
        ).length,

      approved:
        payments.filter(
          (p) => p.status === "APPROVED"
        ).length,

      paid:
        payments.filter(
          (p) => p.status === "PAID"
        ).length,

      amount:
        payments.reduce(
          (sum, p) =>
            sum +
            Number(
              p.amount ||
              p.total_amount ||
              p.outstanding_amount ||
              0
            ),
          0
        ),
    }), [payments]);

  return (
    <main className="min-h-screen p-8 text-white">
      <div className="mx-auto max-w-7xl">

        <p className="text-xs uppercase tracking-[0.35em] text-white/50">
          Finance / Accounts Payable
        </p>

        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-light">
              Vendor Payment Runs
            </h1>

            <p className="mt-2 text-white/60">
              Execute vendor payments, post bank ledger entries and confirm GL posting.
            </p>
          </div>

          <button
            onClick={loadPayments}
            className="rounded-xl bg-blue-600 px-5 py-3"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div
            className={`mt-6 rounded-2xl border p-4 ${
              message.type === "success"
                ? "border-emerald-400/30 bg-emerald-400/10"
                : "border-red-400/30 bg-red-400/10"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <Card title="Payments" value={totals.total} />
          <Card title="Pending" value={totals.pending} />
          <Card title="Approved" value={totals.approved} />
          <Card title="Paid" value={totals.paid} />
          <Card
            title="Total Amount"
            value={totals.amount.toLocaleString()}
          />
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="w-full">
            <thead className="border-b border-white/10">
              <tr className="text-left text-sm text-white/60">
                <th className="p-4">Vendor</th>
                <th className="p-4">Reference</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Due</th>
                <th className="p-4">Status</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-white/60"
                  >
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && payments.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-white/60"
                  >
                    No vendor payments found.
                  </td>
                </tr>
              )}

              {payments.map((payment, index) => {
                const paid =
                  payment.status === "PAID";

                return (
                  <tr
                    key={payment.id || index}
                    className="border-t border-white/5"
                  >
                    <td className="p-4">
                      {payment.vendor_name ||
                        payment.vendor ||
                        payment.vendor_id ||
                        "-"}
                    </td>

                    <td className="p-4">
                      {payment.reference_number ||
                        payment.reference ||
                        payment.invoice_number ||
                        payment.id ||
                        "-"}
                    </td>

                    <td className="p-4">
                      {Number(
                        payment.amount ||
                          payment.total_amount ||
                          payment.outstanding_amount ||
                          0
                      ).toLocaleString()}
                    </td>

                    <td className="p-4">
                      {payment.due_date || "-"}
                    </td>

                    <td className="p-4">
                      {payment.status || "OPEN"}
                    </td>

                    <td className="p-4">
                      <button
                        disabled={
                          paid ||
                          runningId === payment.id
                        }
                        onClick={() =>
                          runPayment(payment)
                        }
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {paid
                          ? "Paid"
                          : runningId === payment.id
                            ? "Posting..."
                            : "Run Payment"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  );
}

function Card({
  title,
  value,
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-sm text-white/50">
        {title}
      </div>

      <div className="mt-2 text-3xl font-light">
        {value}
      </div>
    </div>
  );
}
