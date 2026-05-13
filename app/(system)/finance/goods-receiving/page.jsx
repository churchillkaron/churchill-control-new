"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function GoodsReceivingPage() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: poData } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        vendors (
          id,
          legal_name
        )
      `)
      .in("status", ["approved", "sent", "partially_received"])
      .order("created_at", { ascending: false });

    const { data: receiptData } = await supabase
      .from("goods_receipts")
      .select(`
        *,
        vendors (
          id,
          legal_name
        ),
        purchase_orders (
          id,
          po_number
        )
      `)
      .order("created_at", { ascending: false });

    setPurchaseOrders(poData || []);
    setReceipts(receiptData || []);
    setLoading(false);
  }

  async function receivePO(po) {
    try {
      setActionLoading(po.id);

      const grnNumber = `GRN-${Date.now()}`;

      const { error: receiptError } = await supabase
        .from("goods_receipts")
        .insert([
          {
            grn_number: grnNumber,
            purchase_order_id: po.id,
            vendor_id: po.vendor_id,
            received_by: "system",
            status: "received",
            received_date: new Date().toISOString().slice(0, 10),
            notes: "Goods received from purchase order",
          },
        ]);

      if (receiptError) {
        alert(receiptError.message);
        return;
      }

      const { error: poError } = await supabase
        .from("purchase_orders")
        .update({
          status: "received",
          updated_at: new Date().toISOString(),
        })
        .eq("id", po.id);

      if (poError) {
        alert(poError.message);
        return;
      }

      await fetchData();
    } finally {
      setActionLoading("");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading goods receiving...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold">Goods Receiving</h1>
        <div className="text-white/50 mt-2">
          Validate supplier deliveries before invoice payment
        </div>
      </div>

      <div className="mb-16">
        <h2 className="text-2xl mb-6">Purchase Orders Awaiting Receiving</h2>

        {purchaseOrders.length === 0 && (
          <Empty text="No purchase orders awaiting receiving" />
        )}

        {purchaseOrders.map((po) => (
          <div
            key={po.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-2xl font-semibold">{po.po_number}</div>
                <div className="text-white/40 mt-1">
                  {po.vendors?.legal_name || "-"}
                </div>
                <div className="mt-4 text-white/70">
                  Total: ฿{Number(po.total_amount || 0).toLocaleString()}
                </div>
                <div className="text-white/70">
                  Status: {po.status}
                </div>
              </div>

              <button
                onClick={() => receivePO(po)}
                disabled={actionLoading === po.id}
                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl disabled:opacity-50"
              >
                {actionLoading === po.id ? "Receiving..." : "Receive Goods"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-2xl mb-6">Goods Receipt History</h2>

        {receipts.length === 0 && (
          <Empty text="No goods receipts created yet" />
        )}

        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-2xl font-semibold">
                  {receipt.grn_number}
                </div>
                <div className="text-white/40 mt-1">
                  PO: {receipt.purchase_orders?.po_number || "-"}
                </div>
                <div className="mt-4 text-white/70">
                  Vendor: {receipt.vendors?.legal_name || "-"}
                </div>
                <div className="text-white/70">
                  Received Date: {receipt.received_date || "-"}
                </div>
              </div>

              <div className="px-3 py-1 rounded-full text-sm bg-green-600/20 text-green-300">
                {receipt.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>
  );
}