"use client";

import { useEffect, useState } from "react";
import FinanceNav from "@/components/finance/FinanceNav";

export default function ReceivingPage({ params }) {
  const { organizationId } = params;

  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const res = await fetch(
        "/api/procurement/receiving/list",
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

      setReceipts(data.receipts || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8">
      <FinanceNav organizationId={organizationId} />

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-light">
          Goods Receipts
        </h1>

        <div className="mt-6 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-left">GRN</th>
                <th className="p-3 text-left">Vendor</th>
                <th className="p-3 text-left">PO</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                receipts.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="p-3">{r.grn_number}</td>
                    <td className="p-3">{r.vendors?.display_name}</td>
                    <td className="p-3">{r.purchase_orders?.po_number}</td>
                    <td className="p-3">{r.status}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
