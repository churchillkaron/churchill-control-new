"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";


export default function PurchaseOrdersPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;


  const [
    orders,
    setOrders,
  ] = useState([]);

  async function loadOrders() {

    const response =
      await fetch(
        "/api/procurement/purchase-orders/list",
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

    setOrders(
      result.orders || []
    );
  }

  async function approveOrder(
    id
  ) {

    await fetch(
      "/api/procurement/purchase-orders",
      {

        method: "PUT",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          purchase_order_id:
            id,

          approved_by:
            "MANAGER",
        }),
      }
    );

    loadOrders();
  }

  async function autoGenerate() {

    await fetch(
      "/api/procurement/purchase-orders",
      {

        method: "PATCH",

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

    loadOrders();
  }

  useEffect(() => {

    loadOrders();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold mb-3">
              Purchase Orders
            </h1>

            <div className="text-zinc-500">
              Procurement Automation Engine
            </div>

          </div>

          <button
            onClick={
              autoGenerate
            }
            className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
          >
            AUTO GENERATE
          </button>

        </div>

        <div className="space-y-4">

          {orders.map(
            (
              order
            ) => (

              <div
                key={order.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        order.vendors
                          ?.display_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        order.status
                      }
                    </div>

                  </div>

                  <div className="flex items-center gap-6">

                    <div className="text-right">

                      <div className="text-2xl">
                        ฿
                        {
                          order.total_amount
                        }
                      </div>

                    </div>

                    {order.status ===
                      "PENDING_APPROVAL" && (

                      <button
                        onClick={() =>
                          approveOrder(
                            order.id
                          )
                        }
                        className="bg-green-600 rounded-2xl px-6 py-3 font-bold"
                      >
                        APPROVE
                      </button>
                    )}

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
