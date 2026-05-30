"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";


export default function ReceivingPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const [
    purchaseOrders,
    setPurchaseOrders,
  ] = useState([]);

  async function loadPOs() {

    const response =
      await fetch(
        "/api/procurement/receiving/list",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            tenant_id:
              tenantId,

          }),

        }
      );

    const result =
      await response.json();

    setPurchaseOrders(
      result.purchaseOrders || []
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
                          ?.display_name
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
