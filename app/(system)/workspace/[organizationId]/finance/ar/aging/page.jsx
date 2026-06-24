"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FinanceNav from "@/components/finance/FinanceNav";

export default function Page({ params }) {
  const { organizationId } = params;

  const [aging, setAging] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAging();
  }, []);

  async function loadAging() {
    try {
      const res = await fetch("/api/finance/ar/aging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setAging(json.aging || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">
      <FinanceNav organizationId={organizationId} />

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-light">
          AR Aging
        </h1>

        <div className="mt-2 text-white/50">
          Overdue receivables by aging bucket
        </div>

        <div className="mt-8 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-left">Amount</th>
                <th className="p-3 text-left">Outstanding</th>
                <th className="p-3 text-left">Due Date</th>
                <th className="p-3 text-left">Days Overdue</th>
                <th className="p-3 text-left">Bucket</th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                aging.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-3">
                      {row.customer_name}
                    </td>

                    <td className="p-3">
                      {Number(row.amount || 0).toLocaleString()}
                    </td>

                    <td className="p-3">
                      {Number(row.outstanding_balance || 0).toLocaleString()}
                    </td>

                    <td className="p-3">
                      {row.due_date}
                    </td>

                    <td className="p-3">
                      {row.days_overdue}
                    </td>

                    <td className="p-3">
                      {row.aging_bucket}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading && aging.length === 0 && (
            <div className="py-10 text-white/40">
              No aging items found
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
