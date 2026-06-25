"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Page({ params }) {

  const { organizationId } = params;

  const [invoices, setInvoices] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {

    try {

      const res = await fetch(
        "/api/finance/customer-invoices/list",
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
      );

      const json =
        await res.json();

      if (json.success) {
        setInvoices(
          json.invoices || []
        );
      }

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <div className="flex items-center justify-between">

          <div>

            <h1 className="text-3xl font-light">
              Customer Invoices
            </h1>

            <div className="mt-2 text-white/50">
              Accounts Receivable Invoices
            </div>

          </div>

          <Link
            href={`/workspace/${organizationId}/finance/ar/invoices/new`}
            className="rounded-xl bg-[#D6A66A] px-4 py-2 text-black"
          >
            + New Invoice
          </Link>

        </div>

        <div className="mt-8 overflow-auto">

          <table className="w-full">

            <thead>

              <tr className="border-b border-white/10">

                <th className="p-3 text-left">
                  Invoice
                </th>

                <th className="p-3 text-left">
                  Customer
                </th>

                <th className="p-3 text-left">
                  Invoice Date
                </th>

                <th className="p-3 text-left">
                  Due Date
                </th>

                <th className="p-3 text-left">
                  Total
                </th>

                <th className="p-3 text-left">
                  Outstanding
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

              </tr>

            </thead>

            <tbody>

              {!loading &&
                invoices.map(
                  (invoice) => (

                    <tr
                      key={invoice.id}
                      className="border-b border-white/5"
                    >

                      <td className="p-3">
                        {invoice.invoice_number}
                      </td>

                      <td className="p-3">
                        {
                          invoice
                            ?.customer_loyalty_accounts
                            ?.customer_name
                        }
                      </td>

                      <td className="p-3">
                        {invoice.invoice_date}
                      </td>

                      <td className="p-3">
                        {invoice.due_date}
                      </td>

                      <td className="p-3">
                        {Number(
                          invoice.total_amount || 0
                        ).toLocaleString()}
                      </td>

                      <td className="p-3">
                        {Number(
                          invoice.outstanding_balance || 0
                        ).toLocaleString()}
                      </td>

                      <td className="p-3">
                        {invoice.status}
                      </td>

                    </tr>

                  )
                )}

            </tbody>

          </table>

          {!loading &&
            invoices.length === 0 && (

              <div className="py-10 text-white/40">

                No customer invoices found

              </div>

            )}

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
