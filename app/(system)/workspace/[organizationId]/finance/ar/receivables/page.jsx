"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Page({ params }) {

  const { organizationId } = params;

  const [receivables, setReceivables] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    loadReceivables();
  }, []);

  async function loadReceivables() {

    try {

      const res = await fetch(
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
      );

      const json =
        await res.json();

      if (json.success) {
        setReceivables(
          json.receivables || []
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

        <h1 className="text-3xl font-light">
          Accounts Receivable
        </h1>

        <div className="mt-2 text-white/50">
          Outstanding customer balances
        </div>

        <div className="mt-8 overflow-auto">

          <table className="w-full">

            <thead>

              <tr className="border-b border-white/10">

                <th className="p-3 text-left">
                  Invoice
                </th>

                <th className="p-3 text-left">
                  Amount
                </th>

                <th className="p-3 text-left">
                  Outstanding
                </th>

                <th className="p-3 text-left">
                  Due Date
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

              </tr>

            </thead>

            <tbody>

              {!loading &&
                receivables.map((row) => (

                  <tr
                    key={row.id}
                    className="border-b border-white/5"
                  >

                    <td className="p-3">
                      {row.customer_invoice_id}
                    </td>

                    <td className="p-3">
                      {Number(
                        row.amount || 0
                      ).toLocaleString()}
                    </td>

                    <td className="p-3">
                      {Number(
                        row.outstanding_balance || 0
                      ).toLocaleString()}
                    </td>

                    <td className="p-3">
                      {row.due_date}
                    </td>

                    <td className="p-3">
                      {row.status}
                    </td>

                  </tr>

                ))}

            </tbody>

          </table>

          {!loading &&
            receivables.length === 0 && (

              <div className="py-10 text-white/40">
                No receivables found
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
