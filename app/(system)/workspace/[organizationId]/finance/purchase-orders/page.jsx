"use client";

import { useEffect, useState } from "react";

export default function PurchaseOrdersPage({ params }) {
  const { organizationId } = params;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      const res = await fetch(
        "/api/procurement/purchase-orders/list",
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

      setOrders(data.orders || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-light">
          Purchase Orders
        </h1>

        <div className="mt-6 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-left">PO</th>
                <th className="p-3 text-left">Vendor</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Amount</th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                orders.map((po) => (
                  <tr
                    key={po.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-3">
                      {po.po_number}
                    </td>

                    <td className="p-3">
                      {po.vendors?.display_name}
                    </td>

                    <td className="p-3">
                      {po.status}
                    </td>

                    <td className="p-3">
                      {Number(po.total_amount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading &&
            orders.length === 0 && (
              <div className="py-10 text-white/40">
                No purchase orders found
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
