"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ReceivingPage() {

  const [
    purchaseOrders,
    setPurchaseOrders,
  ] = useState([]);

  async function loadPOs() {

    const {
      data,
    } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        vendors (
          vendor_name
        )
      `)
      .eq(
        "status",
        "APPROVED"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    setPurchaseOrders(
      data || []
    );
  }

  async function receivePO(
    id
  ) {

    await fetch(
      "/api/procurement/receiving",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          purchase_order_id:
            id,

          received_by:
            "WAREHOUSE",
        }),
      }
    );

    loadPOs();
  }

  useEffect(() => {

    loadPOs();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Goods Receiving
        </h1>

        <div className="text-zinc-500 mb-10">
          Procurement Intake Engine
        </div>

        <div className="space-y-4">

          {purchaseOrders.map(
            (
              po
            ) => (

              <div
                key={po.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        po.vendors
                          ?.vendor_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        po.status
                      }
                    </div>

                  </div>

                  <div className="flex items-center gap-6">

                    <div className="text-right">

                      <div className="text-2xl">
                        ฿
                        {
                          po.total_amount
                        }
                      </div>

                    </div>

                    <button
                      onClick={() =>
                        receivePO(
                          po.id
                        )
                      }
                      className="bg-green-600 rounded-2xl px-6 py-3 font-bold"
                    >
                      RECEIVE
                    </button>

                  </div>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
