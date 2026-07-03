"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";

export default function InvoicesPage({ params }) {
  const {
    organizationId,
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runtimeLoading) {
      loadInvoices();
    }
  }, [runtimeLoading]);

  async function loadInvoices() {
    try {

      const data =
        await financeGet(
          "/api/finance/vendor-invoices/list"
        );

      setInvoices(
        data.invoices || []
      );

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-light">
          Vendor Invoices
        </h1>

        <div className="mt-6 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-left">
                  Invoice
                </th>

                <th className="p-3 text-left">
                  Vendor
                </th>

                <th className="p-3 text-left">
                  Date
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

                <th className="p-3 text-left">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-3">
                      {invoice.invoice_number}
                    </td>

                    <td className="p-3">
                      {invoice.vendors?.display_name}
                    </td>

                    <td className="p-3">
                      {invoice.invoice_date}
                    </td>

                    <td className="p-3">
                      {invoice.status}
                    </td>

                    <td className="p-3">
                      {Number(
                        invoice.total_amount || 0
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading &&
            invoices.length === 0 && (
              <div className="py-10 text-white/40">
                No vendor invoices found
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
