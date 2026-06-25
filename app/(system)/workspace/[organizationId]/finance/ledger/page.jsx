"use client";

import { useEffect, useState } from "react";

export default function LedgerPage({ params }) {
  const { organizationId } = params;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/finance/general-ledger?organizationId=${organizationId}`
        );

        const json = await res.json();

        if (json.success) {
          setRows(json.rows || []);
        }
      } catch (err) {
        console.error(err);
      }

      setLoading(false);
    }

    load();
  }, [organizationId]);

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><h1 className="text-4xl font-light mb-6">
        General Ledger
      </h1>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">

        <div className="p-5 border-b border-white/10">
          <div className="text-white/50 text-sm">
            Ledger Rows
          </div>

          <div className="text-2xl font-light">
            {rows.length}
          </div>
        </div>

        {loading && (
          <div className="p-6 text-white/50">
            Loading ledger...
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="p-6 text-white/50">
            No ledger entries found.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-white/[0.04]">

                <tr>
                  <th className="text-left p-4">
                    Account
                  </th>

                  <th className="text-right p-4">
                    Debit
                  </th>

                  <th className="text-right p-4">
                    Credit
                  </th>

                  <th className="text-left p-4">
                    Date
                  </th>
                </tr>

              </thead>

              <tbody>

                {rows.map((row) => {

                  const account =
                    Array.isArray(
                      row.chart_of_accounts
                    )
                      ? row.chart_of_accounts[0]
                      : row.chart_of_accounts;

                  return (
                    <tr
                      key={row.id}
                      className="border-t border-white/10"
                    >

                      <td className="p-4">
                        {account?.code} - {account?.name}
                      </td>

                      <td className="p-4 text-right">
                        {Number(
                          row.debit || 0
                        ).toLocaleString()}
                      </td>

                      <td className="p-4 text-right">
                        {Number(
                          row.credit || 0
                        ).toLocaleString()}
                      </td>

                      <td className="p-4">
                        {row.created_at?.slice(0,10)}
                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          </div>
        )}

      </div>

    </div>
  );
}
