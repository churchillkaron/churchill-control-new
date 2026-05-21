"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

import { updatePurchaseOrderReceiptStatus }
from "@/lib/procurement/updatePurchaseOrderReceiptStatus";

export default function GoodsReceiptsPage() {

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    purchase_order_id: "",
    received_date: "",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    const { data: poData } =
      await supabase
        .from("purchase_orders")
        .select(`
          *,
          vendors (
            legal_name
          )
        `)
        .neq("status", "closed")
        .order("created_at", {
          ascending: false,
        });

    const { data: receiptData } =
      await supabase
        .from("goods_receipts")
        .select(`
          *,
          purchase_orders (
            po_number
          )
        `)
        .order("created_at", {
          ascending: false,
        });

    setPurchaseOrders(poData || []);
    setReceipts(receiptData || []);

    setLoading(false);

  }

  async function createReceipt() {

    if (!form.purchase_order_id) {

      alert(
        "Purchase order required"
      );

      return;

    }

    const receiptNumber =
      `GR-${Date.now()}`;

    const { error } =
      await supabase
        .from("goods_receipts")
        .insert([{

          purchase_order_id:
            form.purchase_order_id,

          receipt_number:
            receiptNumber,

          received_by:
            "system",

          received_date:
            form.received_date || null,

          status:
            "received",

          notes:
            form.notes,

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    setForm({
      purchase_order_id: "",
      received_date: "",
      notes: "",
    });

    await fetchData();

  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading goods receipts...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Goods Receipts
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise receiving and delivery verification
        </div>

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Goods Receipt
        </h2>

        <div className="grid grid-cols-2 gap-4">

          <select
            value={form.purchase_order_id}
            onChange={(e) =>
              setForm({
                ...form,
                purchase_order_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >

            <option value="">
              Select Purchase Order
            </option>

            {purchaseOrders.map((po) => (

              <option
                key={po.id}
                value={po.id}
              >

                {po.po_number}
                {" — "}
                {po.vendors?.legal_name}

              </option>

            ))}

          </select>

          <input
            type="date"
            value={form.received_date}
            onChange={(e) =>
              setForm({
                ...form,
                received_date:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

        </div>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) =>
            setForm({
              ...form,
              notes:
                e.target.value,
            })
          }
          className="bg-black border border-white/10 rounded-xl px-4 py-3 w-full mt-4 min-h-[120px]"
        />

        <button
          onClick={createReceipt}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >

          Create Receipt

        </button>

      </div>

      {/* LIST */}
      <div>

        <h2 className="text-2xl mb-6">
          Goods Receipts
        </h2>

        {receipts.length === 0 && (

          <Empty text="No receipts found" />

        )}

        {receipts.map((receipt) => (

          <div
            key={receipt.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {receipt.receipt_number}
                </div>

                <div className="text-white/40 mt-1">

                  {receipt.purchase_orders?.po_number || "-"}

                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Received Date:
                    {" "}
                    {receipt.received_date || "-"}
                  </div>

                  <div>
                    Received By:
                    {" "}
                    {receipt.received_by || "-"}
                  </div>

                  <div>
                    Status:
                    {" "}
                    {receipt.status}
                  </div>

                </div>

              </div>

              <div className="px-4 py-2 rounded-full text-sm bg-green-600/20 text-green-300">

                RECEIVED

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

function Empty({
  text,
}) {

  return (

    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
      {text}
    </div>

  );

}