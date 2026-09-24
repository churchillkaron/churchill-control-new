"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";

import {
  useBusinessContext,
} from "@/app/providers/BusinessContextProvider";


export default function PurchaseOrdersPage() {

  const businessContext =
    useBusinessContext();

  const organizationId =
    businessContext?.organization_id ||
    businessContext?.organization?.id;

  const entityId =
    businessContext?.entity_id ||
    businessContext?.entity?.id;


  const [
    orders,
    setOrders,
  ] = useState([]);

  const loadOrders = useCallback(async () => {

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

            organization_id:
              organizationId,

            entity_id:
              entityId,

          }),

        }
      );

    const result =
      await response.json();

    setOrders(
      result.orders || []
    );
  }, [organizationId, entityId]);

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

          organization_id:
            organizationId,
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

          organization_id:
            organizationId,

          entity_id:
            entityId,
        }),
      }
    );

    loadOrders();
  }

  useEffect(() => {

    loadOrders();

  }, [loadOrders]);

  return (

    <div className="min-h-screen bg-[#F7F6F3] text-[#191919] p-10">

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
                className="border border-black/[0.08] rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {order.parties?.display_name || order.vendors?.display_name || "Supplier"}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      Customer PO · {order.status}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                        Supplier · {order.supplier_response?.response_status || (order.status === "APPROVED" ? "PENDING" : "WAITING FOR APPROVAL")}
                      </span>
                      {order.supplier_response?.promised_delivery_date ? (
                        <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-400">
                          Promised {order.supplier_response.promised_delivery_date}
                        </span>
                      ) : null}
                      {order.supplier_response?.dispatch_reference ? (
                        <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-400">
                          Dispatch {order.supplier_response.dispatch_reference}
                        </span>
                      ) : null}
                    </div>

                    {order.supplier_response?.supplier_note ? (
                      <div className="mt-3 max-w-2xl text-sm text-zinc-400">
                        Supplier note · {order.supplier_response.supplier_note}
                      </div>
                    ) : null}

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
