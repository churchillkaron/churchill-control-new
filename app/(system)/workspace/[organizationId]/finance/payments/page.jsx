"use client";

import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function PaymentsPage({ params }) {

  const { organizationId } = params;

  const [payables, setPayables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {

    try {

      const res = await fetch(
        "/api/finance/payments/list",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
          }),
        }
      );

      const data = await res.json();

      setPayables(
        data.payables || []
      );

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">

      <FinanceNav
        organizationId={organizationId}
      />

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <h1 className="text-3xl font-light">
          Payments
        </h1>

        <div className="mt-6 overflow-auto">

          <table className="w-full">

            <thead>
              <tr className="border-b border-white/10">

                <th className="p-3 text-left">
                  Vendor
                </th>

                <th className="p-3 text-left">
                  Invoice
                </th>

                <th className="p-3 text-left">
                  Amount
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

              </tr>
            </thead>

            <tbody>

              {!loading &&
                payables.map((item) => (

                  <tr
                    key={item.id}
                    className="border-b border-white/5"
                  >

                    <td className="p-3">
                      {item.vendors?.display_name}
                    </td>

                    <td className="p-3">
                      {item.vendor_invoice_id}
                    </td>

                    <td className="p-3">
                      {Number(
                        item.amount || 0
                      ).toLocaleString()}
                    </td>

                    <td className="p-3">
                      {item.status}
                    </td>

                  </tr>

                ))}

            </tbody>

          </table>

          {!loading &&
            payables.length === 0 && (
              <div className="py-10 text-white/40">
                No payments pending
              </div>
            )}

        </div>

      </div>

    </div>
  );
}
