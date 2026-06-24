"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FinanceNav from "@/components/finance/FinanceNav";

export default function Page({ params }) {

  const { organizationId } = params;

  const [payments, setPayments] =
    useState([]);

  const [receivables, setReceivables] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [posting, setPosting] =
    useState(false);

  const [customerInvoiceId, setCustomerInvoiceId] =
    useState("");

  const [customerId, setCustomerId] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [paymentMethod, setPaymentMethod] =
    useState("CASH");

  const [referenceNumber, setReferenceNumber] =
    useState("");

  const [paidBy, setPaidBy] =
    useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {

    try {

      const [paymentsRes, receivablesRes] =
        await Promise.all([

          fetch(
            "/api/finance/customer-payments/list",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                organizationId,
              }),
            }
          ),

          fetch(
            "/api/finance/accounts-receivable/list",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                organizationId,
              }),
            }
          ),

        ]);

      const paymentsJson =
        await paymentsRes.json();

      const receivablesJson =
        await receivablesRes.json();

      if (paymentsJson.success) {

        setPayments(
          paymentsJson.payments || []
        );

      }

      if (receivablesJson.success) {

        setReceivables(
          (receivablesJson.receivables || [])
            .filter(
              r =>
                r.status !== "PAID"
            )
        );

      }

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  async function postPayment() {

    if (!customerInvoiceId) {
      alert("Select receivable");
      return;
    }

    if (!amount) {
      alert("Enter amount");
      return;
    }

    setPosting(true);

    try {

      const res =
        await fetch(
          "/api/finance/customer-payments/create",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({

              organizationId,

              customer_id:
                customerId,

              customer_invoice_id:
                customerInvoiceId,

              payment_date:
                new Date()
                  .toISOString()
                  .slice(0, 10),

              amount:
                Number(amount),

              payment_method:
                paymentMethod,

              reference_number:
                referenceNumber,

              paid_by:
                paidBy,

            }),
          }
        );

      const json =
        await res.json();

      if (!json.success) {

        alert(
          json.error ||
          "Payment failed"
        );

        return;

      }

      alert("Payment posted");

      setCustomerInvoiceId("");
      setCustomerId("");
      setAmount("");
      setReferenceNumber("");
      setPaidBy("");

      await loadData();

    } catch (error) {

      console.error(error);

      alert("Payment failed");

    } finally {

      setPosting(false);

    }

  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <h1 className="text-3xl font-light">
          Customer Payments
        </h1>

        <div className="mt-2 text-white/50">
          Post customer payments and view payment history
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">

          <select
            value={customerInvoiceId}
            onChange={(e) => {

              const row =
                receivables.find(
                  r =>
                    r.customer_invoice_id ===
                    e.target.value
                );

              setCustomerInvoiceId(
                e.target.value
              );

              setCustomerId(
                row?.customer_id || ""
              );

            }}
            className="rounded-xl bg-black/30 border border-white/10 p-3"
          >
            <option value="">
              Select Receivable
            </option>

            {receivables.map((r) => (

              <option
                key={r.id}
                value={
                  r.customer_invoice_id
                }
              >
                {r.customer_invoice_id}
                {" | "}
                Outstanding:
                {" "}
                {Number(
                  r.outstanding_balance || 0
                ).toLocaleString()}
              </option>

            ))}
          </select>

          <input
            value={amount}
            onChange={(e) =>
              setAmount(
                e.target.value
              )
            }
            placeholder="Amount"
            className="rounded-xl bg-black/30 border border-white/10 p-3"
          />

          <select
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(
                e.target.value
              )
            }
            className="rounded-xl bg-black/30 border border-white/10 p-3"
          >
            <option value="CASH">
              CASH
            </option>
            <option value="CARD">
              CARD
            </option>
            <option value="BANK_TRANSFER">
              BANK TRANSFER
            </option>
          </select>

          <input
            value={referenceNumber}
            onChange={(e) =>
              setReferenceNumber(
                e.target.value
              )
            }
            placeholder="Reference"
            className="rounded-xl bg-black/30 border border-white/10 p-3"
          />

          <input
            value={paidBy}
            onChange={(e) =>
              setPaidBy(
                e.target.value
              )
            }
            placeholder="Paid By"
            className="rounded-xl bg-black/30 border border-white/10 p-3"
          />

        </div>

        <button
          onClick={postPayment}
          disabled={posting}
          className="mt-6 rounded-xl bg-[#D6A66A] px-6 py-3 text-black"
        >
          {posting
            ? "Posting..."
            : "Post Payment"}
        </button>

        <div className="mt-10 overflow-auto">

          <table className="w-full">

            <thead>

              <tr className="border-b border-white/10">

                <th className="p-3 text-left">
                  Date
                </th>

                <th className="p-3 text-left">
                  Invoice
                </th>

                <th className="p-3 text-left">
                  Amount
                </th>

                <th className="p-3 text-left">
                  Method
                </th>

                <th className="p-3 text-left">
                  Reference
                </th>

              </tr>

            </thead>

            <tbody>

              {!loading &&
                payments.map((payment) => (

                  <tr
                    key={payment.id}
                    className="border-b border-white/5"
                  >

                    <td className="p-3">
                      {payment.payment_date}
                    </td>

                    <td className="p-3">
                      {payment.customer_invoice_id}
                    </td>

                    <td className="p-3">
                      {Number(
                        payment.amount || 0
                      ).toLocaleString()}
                    </td>

                    <td className="p-3">
                      {payment.payment_method}
                    </td>

                    <td className="p-3">
                      {payment.reference_number}
                    </td>

                  </tr>

                ))}

            </tbody>

          </table>

        </div>

        <div className="mt-8">

          <Link
            href={`/workspace/${organizationId}/finance/ar`}
            className="text-[#D6A66A]"
          >
            ← Back to AR
          </Link>

        </div>

      </div>

    </div>
  );
}
