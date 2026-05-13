"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function PurchaseOrdersPage() {

  const [requests, setRequests] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {

    setLoading(true);

    // APPROVED PURCHASE REQUESTS
    const { data: requestData } =
      await supabase
        .from("purchase_requests")
        .select(`
          *,
          vendors (
            id,
            legal_name
          )
        `)
        .eq("status", "approved")
        .order("created_at", {
          ascending: false,
        });

    // PURCHASE ORDERS
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

    setRequests(requestData || []);
    setPurchaseOrders(poData || []);

    setLoading(false);

  }

  // ---------------------------------
  // CREATE PURCHASE ORDER
  // ---------------------------------

  async function createPO(request) {

    const poNumber =
      `PO-${Date.now()}`;

    const total =
      Number(
        request.estimated_cost || 0
      );

    const { error } =
      await supabase
        .from("purchase_orders")
        .insert([{

          po_number:
            poNumber,

          purchase_request_id:
            request.id,

          vendor_id:
            request.vendor_id,

          subtotal:
            total,

          total_amount:
            total,

          status:
            "pending_manager",

          ordered_by:
            "system",

          expected_delivery_date:
            request.needed_by || null,

          notes:
            request.notes || null,

        }]);

    if (error) {

      console.error(error);
      alert(error.message);

      return;

    }

    await fetchData();

  }

  // ---------------------------------
  // UI
  // ---------------------------------

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
          Enterprise procurement execution layer
        </div>

      </div>

      {/* APPROVED REQUESTS */}
      <div className="mb-16">

        <h2 className="text-2xl mb-6">
          Approved Requests Awaiting PO
        </h2>

        {requests.length === 0 && (

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
            No approved requests
          </div>

        )}

        {requests.map((request) => (

          <div
            key={request.id}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-4"
          >

            <div className="flex justify-between items-start">

              <div>

                <div className="text-2xl font-semibold">
                  {request.title}
                </div>

                <div className="text-white/40 mt-1">
                  {request.request_number}
                </div>

                <div className="mt-4 space-y-1 text-white/70">

                  <div>
                    Vendor:
                    {" "}
                    {request.vendors?.legal_name || "-"}
                  </div>

                  <div>
                    Estimated Cost:
                    {" "}
                    ฿{Number(
                      request.estimated_cost || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Needed By:
                    {" "}
                    {request.needed_by || "-"}
                  </div>

                </div>

              </div>

              <button

                onClick={() =>
                  createPO(request)
                }

                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl"

              >

                Create PO

              </button>

            </div>

          </div>

        ))}

      </div>

      {/* PURCHASE ORDERS */}
      <div>

        <h2 className="text-2xl mb-6">
          Procurement Orders
        </h2>

        {purchaseOrders.length === 0 && (

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/40">
            No purchase orders
          </div>

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
                    Status:
                    {" "}
                    {po.status}
                  </div>

                  <div>
                    Total:
                    {" "}
                    ฿{Number(
                      po.total_amount || 0
                    ).toLocaleString()}
                  </div>

                  <div>
                    Expected Delivery:
                    {" "}
                    {po.expected_delivery_date || "-"}
                  </div>

                </div>

              </div>

              <div className="px-3 py-1 rounded-full text-sm bg-blue-600/20 text-blue-300">

                {po.status}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}