"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function PurchaseOrdersPage() {

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    vendor_id: "",
    order_date: "",
    expected_delivery_date: "",
    subtotal: "",
    tax_amount: "",
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
            id,
            legal_name
          )
        `)
        .order("created_at", {
          ascending: false,
        });

    const { data: vendorData } =
      await supabase
        .from("vendors")
        .select("*")
        .eq("is_active", true)
        .order("legal_name");

    setPurchaseOrders(poData || []);
    setVendors(vendorData || []);

    setLoading(false);

  }

  async function createPurchaseOrder() {

    if (!form.vendor_id) {

      alert("Vendor required");

      return;

    }

    const subtotal =
      Number(form.subtotal || 0);

    const taxAmount =
      Number(form.tax_amount || 0);

    const totalAmount =
      subtotal + taxAmount;

    const poNumber =
      `PO-${Date.now()}`;

    const { error } =
      await supabase
        .from("purchase_orders")
        .insert([{

          vendor_id:
            form.vendor_id,

          po_number:
            poNumber,

          order_date:
            form.order_date || null,

          expected_delivery_date:
            form.expected_delivery_date || null,

          subtotal:
            subtotal,

          tax_amount:
            taxAmount,

          total_amount:
            totalAmount,

          status:
            "draft",

          notes:
            form.notes,

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    setForm({
      vendor_id: "",
      order_date: "",
      expected_delivery_date: "",
      subtotal: "",
      tax_amount: "",
      notes: "",
    });

    await fetchData();

  }

  async function updateStatus(
    po,
    status
  ) {

    const { error } =
      await supabase
        .from("purchase_orders")
        .update({

          status,

          updated_at:
            new Date().toISOString(),

        })
        .eq("id", po.id);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    await fetchData();

  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white p-10">
        Loading purchase orders...
      </div>
    );

  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      {/* HEADER */}
      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          Purchase Orders
        </h1>

        <div className="text-white/50 mt-2">
          Enterprise procurement purchasing lifecycle
        </div>

      </div>

      {/* CREATE */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-10">

        <h2 className="text-2xl mb-6">
          Create Purchase Order
        </h2>

        <div className="grid grid-cols-2 gap-4">

          <select
            value={form.vendor_id}
            onChange={(e) =>
              setForm({
                ...form,
                vendor_id:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          >

            <option value="">
              Select Vendor
            </option>

            {vendors.map((vendor) => (

              <option
                key={vendor.id}
                value={vendor.id}
              >

                {vendor.legal_name}

              </option>

            ))}

          </select>

          <input
            type="date"
            value={form.order_date}
            onChange={(e) =>
              setForm({
                ...form,
                order_date:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="date"
            value={form.expected_delivery_date}
            onChange={(e) =>
              setForm({
                ...form,
                expected_delivery_date:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Subtotal"
            value={form.subtotal}
            onChange={(e) =>
              setForm({
                ...form,
                subtotal:
                  e.target.value,
              })
            }
            className="bg-black border border-white/10 rounded-xl px-4 py-3"
          />

          <input
            type="number"
            placeholder="Tax Amount"
            value={form.tax_amount}
            onChange={(e) =>
              setForm({
                ...form,
                tax_amount:
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
          onClick={createPurchaseOrder}
          className="mt-6 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"
        >

          Create Purchase Order

        </button>

      </div>

      {/* LIST */}
      <div>

        <h2 className="text-2xl mb-6">
          Purchase Orders
        </h2>

        {purchaseOrders.length === 0 && (

          <Empty text="No purchase orders found" />

        )}

        {purchaseOrders.map((po) => (

          <div
            key={po.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {po.po_number}
                </div>

                <div className="text-white/40 mt-1">

                  {po.vendors?.legal_name || "-"}

                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Order Date:
                    {" "}
                    {po.order_date || "-"}
                  </div>

                  <div>
                    Expected Delivery:
                    {" "}
                    {po.expected_delivery_date || "-"}
                  </div>

                  <div>
                    Subtotal:
                    {" "}
                    ฿{Number(
                      po.subtotal || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Tax:
                    {" "}
                    ฿{Number(
                      po.tax_amount || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Total:
                    {" "}
                    ฿{Number(
                      po.total_amount || 0
                    ).toLocaleString()}
                  </div>

                </div>

              </div>

              <div className="flex flex-col items-end gap-3">

                <div className="px-4 py-2 rounded-full text-sm bg-blue-600/20 text-blue-300">

                  {po.status}

                </div>

                <div className="flex flex-wrap gap-2 justify-end">

                  <button
                    onClick={() =>
                      updateStatus(
                        po,
                        "approved"
                      )
                    }
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-xl"
                  >

                    Approve

                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        po,
                        "sent"
                      )
                    }
                    className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-xl"
                  >

                    Send

                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        po,
                        "closed"
                      )
                    }
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl"
                  >

                    Close

                  </button>

                </div>

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