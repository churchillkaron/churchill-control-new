"use client";

import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function MatchingPage({ params }) {

  const { organizationId } = params;

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {

    try {

      const res = await fetch(
        "/api/finance/invoice-matching/runtime",
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

      setMatches(
        data.matches || []
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
          Invoice Matching
        </h1>

        <div className="mt-6 overflow-auto">

          <table className="w-full">

            <thead>
              <tr className="border-b border-white/10">

                <th className="p-3 text-left">
                  Invoice
                </th>

                <th className="p-3 text-left">
                  Purchase Order
                </th>

                <th className="p-3 text-left">
                  Goods Receipt
                </th>

                <th className="p-3 text-left">
                  Status
                </th>

              </tr>
            </thead>

            <tbody>

              {!loading &&
                matches.map((match) => (

                  <tr
                    key={match.id}
                    className="border-b border-white/5"
                  >

                    <td className="p-3">
                      {match.invoice_id}
                    </td>

                    <td className="p-3">
                      {match.purchase_order_id}
                    </td>

                    <td className="p-3">
                      {match.goods_receipt_id}
                    </td>

                    <td className="p-3">
                      {match.status}
                    </td>

                  </tr>

                ))}

            </tbody>

          </table>

          {!loading &&
            matches.length === 0 && (
              <div className="py-10 text-white/40">
                No matches found
              </div>
            )}

        </div>

      </div>

    </div>
  );
}
