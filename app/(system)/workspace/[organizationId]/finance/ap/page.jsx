"use client";

import { useEffect, useState } from "react";

export default function AccountsPayablePage({
  params,
}) {
  const { organizationId } = params;

  const [loading, setLoading] =
    useState(true);

  const [payables, setPayables] =
    useState([]);

  useEffect(() => {
    loadPayables();
  }, [organizationId]);

  async function loadPayables() {
    try {

      const res = await fetch(
        "/api/finance/payments/list",
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

      setPayables(
        json.payables || []
      );

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }
  }

  const totalOpen =
    payables.reduce(
      (sum, row) =>
        sum +
        Number(
          row.amount || 0
        ),
      0
    );

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="mb-8">

        <h1 className="text-4xl font-light">
          Accounts Payable
        </h1>

        <div className="text-white/50 mt-2">
          Open vendor obligations
        </div>

      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-white/50 text-sm">
            Open Payables
          </div>

          <div className="text-3xl mt-2">
            {payables.length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-white/50 text-sm">
            Outstanding Amount
          </div>

          <div className="text-3xl mt-2">
            {totalOpen.toLocaleString()}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-white/50 text-sm">
            Status
          </div>

          <div className="text-3xl mt-2">
            LIVE
          </div>
        </div>

      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">

        <div className="p-6 border-b border-white/10">
          Open Payables
        </div>

        {loading ? (

          <div className="p-6 text-white/50">
            Loading...
          </div>

        ) : payables.length === 0 ? (

          <div className="p-6 text-white/50">
            No open payables found.
          </div>

        ) : (

          <table className="w-full">

            <thead>

              <tr className="border-b border-white/10 text-white/50">

                <th className="text-left p-4">
                  Vendor
                </th>

                <th className="text-left p-4">
                  Amount
                </th>

                <th className="text-left p-4">
                  Status
                </th>

                <th className="text-left p-4">
                  Created
                </th>

              </tr>

            </thead>

            <tbody>

              {payables.map(
                (row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-4">

                      {row.vendors
                        ?.display_name ||

                        row.vendors
                          ?.legal_name ||

                        "Unknown Vendor"}

                    </td>

                    <td className="p-4">

                      {Number(
                        row.amount || 0
                      ).toLocaleString()}

                    </td>

                    <td className="p-4">
                      {row.status}
                    </td>

                    <td className="p-4">

                      {row.created_at
                        ?.slice(0,10)}

                    </td>
                  </tr>
                )
              )}

            </tbody>

          </table>

        )}

      </div>

    </div>
  );
}
