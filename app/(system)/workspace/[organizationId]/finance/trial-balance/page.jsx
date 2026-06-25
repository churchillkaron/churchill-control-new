"use client";

import { useEffect, useState } from "react";

export default function TrialBalancePage({ params }) {
  const { organizationId } = params;

  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(
        `/api/finance/trial-balance?organizationId=${organizationId}`
      );

      const json = await res.json();

      setData(json);
    }

    load();
  }, [organizationId]);

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><h1 className="text-4xl font-light mb-6">
        Trial Balance
      </h1>

      {!data && (
        <div className="text-white/50">
          Loading...
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-white/50 text-sm">
                Total Debits
              </div>
              <div className="text-2xl">
                {Number(data.totalDebits || 0).toLocaleString()}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-white/50 text-sm">
                Total Credits
              </div>
              <div className="text-2xl">
                {Number(data.totalCredits || 0).toLocaleString()}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-white/50 text-sm">
                Status
              </div>
              <div className="text-2xl">
                {data.balanced ? "BALANCED" : "OUT OF BALANCE"}
              </div>
            </div>

          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">

            <table className="w-full text-sm">

              <thead className="bg-white/[0.04]">

                <tr>
                  <th className="text-left p-4">Code</th>
                  <th className="text-left p-4">Account</th>
                  <th className="text-right p-4">Debits</th>
                  <th className="text-right p-4">Credits</th>
                  <th className="text-right p-4">Balance</th>
                </tr>

              </thead>

              <tbody>

                {(data.rows || []).map((row) => (
                  <tr
                    key={row.account_id}
                    className="border-t border-white/10"
                  >
                    <td className="p-4">{row.code}</td>
                    <td className="p-4">{row.name}</td>

                    <td className="p-4 text-right">
                      {Number(row.total_debits || 0).toLocaleString()}
                    </td>

                    <td className="p-4 text-right">
                      {Number(row.total_credits || 0).toLocaleString()}
                    </td>

                    <td className="p-4 text-right">
                      {Number(row.balance || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        </>
      )}

    </div>
  );
}
