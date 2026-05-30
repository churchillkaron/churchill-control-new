"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Flame,
  Clock3,
  CheckCircle2,
  PauseCircle,
} from "lucide-react";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  useTenant,
} from "@/app/providers/TenantProvider";



export default function KitchenPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function loadKitchen() {

    if (!tenantId) {
      return;
    }

    setLoading(true);

    const {
      data,
      error,
    } = await supabase

      .from("orders")

      .select(`
        *,
        order_items (*)
      `)

      .eq(
        "tenant_id",
        tenantId
      )

      .in(
        "status",
        [
          "OPEN",
          "ACTIVE",
          "READY_FOR_PAYMENT",
          "PARTIAL",
        ]
      )

      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setOrders(data || []);

    setLoading(false);

  }

  useEffect(() => {

    loadKitchen();

    const orderChannel =
      supabase
        .channel("kitchen-live")

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          () => {
            loadKitchen();
          }
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        orderChannel
      );
    };

  }, []);

  async function updateItemStatus(
    item,
    nextStatus
  ) {

    await supabase

      .from("order_items")

      .update({

        status:
          nextStatus,

      })

      .eq(
        "id",
        item.id
      );

    loadKitchen();

  }

  const kitchenItems =
    useMemo(() => {

      return orders.flatMap(
        order =>

          (order.order_items || [])

            .filter(item => {

              const activeStatuses = [
                "NEW",
                "PENDING",
                "COOKING",
                "READY",
                "HOLD",
              ];

              return activeStatuses.includes(
                item.status
              );

            })

            .map(
              item => ({
                ...item,

                normalized_status:

                  item.status === "NEW"
                    ? "PENDING"
                    : item.status,

                table_number:
                  order.table_number,

                order_id:
                  order.id,

                created_at:
                  item.created_at ||
                  order.created_at,
              })
            )
      );

    }, [orders]);

  function getWaitMinutes(
    createdAt
  ) {

    if (!createdAt)
      return 0;

    const utcString = createdAt.replace(" ", "T") + "Z";

    const created = new Date(utcString);

    return Math.max(
      0,
      Math.floor(
        (Date.now() - created.getTime()) /
        1000 /
        60
      )
    );

  }

  return (

    <div className="min-h-screen bg-black p-8 text-white">

      <div className="mb-10 flex items-center justify-between">

        <div>

          <h1 className="text-5xl font-bold tracking-tight">

            Kitchen Operations

          </h1>

          <p className="mt-3 text-lg text-zinc-500">

            Live production control

          </p>

        </div>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading kitchen...
        </div>

      ) : (

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

          {kitchenItems.map(
            item => (

              <KitchenCard
                key={item.id}
                item={item}
                waitMinutes={
                  getWaitMinutes(
                    item.created_at
                  )
                }
                onUpdate={
                  updateItemStatus
                }
              />
            )
          )}

        </div>

      )}

    </div>

  );

}

function KitchenCard({
  item,
  waitMinutes,
  onUpdate,
}) {

  const status =
    item.normalized_status;

  return (

    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">

      <div className="mb-4 flex items-center justify-between">

        <div className="text-2xl font-bold">

          {
            item.item_name
          }

        </div>

        <div className="text-sm font-bold text-violet-400">

          {status}

        </div>

      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-zinc-400">

        <div>
          Table:
          {" "}
          {item.table_number}
        </div>

        <div>
          Qty:
          {" "}
          {item.quantity}
        </div>

        <div>
          Wait:
          {" "}
          {waitMinutes} min
        </div>

        <div>
          Station:
          {" "}
          {item.station || "HOT"}
        </div>

      </div>

      <div className="mt-5 flex gap-3">

        {(status === "PENDING") && (

          <>
            <button
              onClick={() =>
                onUpdate(
                  item,
                  "COOKING"
                )
              }
              className="flex-1 rounded-2xl bg-orange-500 py-3 font-semibold text-black"
            >

              FIRE

            </button>

            <button
              onClick={() =>
                onUpdate(
                  item,
                  "HOLD"
                )
              }
              className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-900 py-3"
            >

              HOLD

            </button>
          </>

        )}

        {status ===
          "HOLD" && (

          <button
            onClick={() =>
              onUpdate(
                item,
                "PENDING"
              )
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-yellow-500 py-3 font-semibold text-black"
          >

            <PauseCircle
              size={18}
            />

            RELEASE

          </button>

        )}

        {status ===
          "COOKING" && (

          <button
            onClick={() =>
              onUpdate(
                item,
                "READY"
              )
            }
            className="flex-1 rounded-2xl bg-green-500 py-3 font-semibold text-black"
          >

            READY

          </button>

        )}

      </div>

    </div>

  );

}
