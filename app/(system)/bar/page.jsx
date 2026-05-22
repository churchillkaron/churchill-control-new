"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Wine,
  Clock3,
  CheckCircle2,
} from "lucide-react";

import { supabase }
from "@/lib/shared/supabase/client";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function BarPage() {

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function loadBar() {

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
        TENANT_ID
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

    loadBar();

    const channel =
      supabase

        .channel("bar-live")

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          () => {
            loadBar();
          }
        )

        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );

    };

  }, []);

  async function updateItemStatus(
    item,
    nextStatus
  ) {

    const { error } =
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

    if (error) {

      console.error(error);

      return;

    }

    loadBar();

  }

  const barItems =
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

              return (

                activeStatuses.includes(
                  item.status
                ) &&

                item.station ===
                "BAR"

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
              })
            )
      );

    }, [orders]);

  function getWaitMinutes(
    createdAt
  ) {

    if (!createdAt)
      return 0;

    const utcString =
      createdAt.replace(
        " ",
        "T"
      ) + "Z";

    const created =
      new Date(
        utcString
      );

    return Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          created.getTime()
        ) /
        1000 /
        60
      )
    );

  }

  return (

    <div className="min-h-screen bg-[#140c0c] p-8 text-white">

      <div className="mb-10 flex items-center justify-between">

        <div>

          <h1 className="text-5xl font-bold tracking-tight">

            Bar Operations

          </h1>

          <p className="mt-3 text-lg text-zinc-500">

            Live drink production

          </p>

        </div>

        <div className="flex gap-4">

          <TopStat
            label="PENDING"
            value={
              barItems.filter(
                i =>
                  i.normalized_status ===
                  "PENDING"
              ).length
            }
            icon={<Clock3 />}
          />

          <TopStat
            label="MAKING"
            value={
              barItems.filter(
                i =>
                  i.normalized_status ===
                  "COOKING"
              ).length
            }
            icon={<Wine />}
          />

          <TopStat
            label="READY"
            value={
              barItems.filter(
                i =>
                  i.normalized_status ===
                  "READY"
              ).length
            }
            icon={<CheckCircle2 />}
          />

        </div>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading bar...
        </div>

      ) : (

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

          {barItems.map(
            item => (

              <BarCard
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

function TopStat({
  label,
  value,
  icon,
}) {

  return (

    <div className="min-w-[140px] rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4">

      <div className="mb-3 flex items-center justify-between text-zinc-500">

        <div className="text-sm">
          {label}
        </div>

        {icon}

      </div>

      <div className="text-3xl font-bold">

        {value}

      </div>

    </div>

  );

}

function BarCard({
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

        <div className="text-sm font-bold text-cyan-400">

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
          BAR
        </div>

      </div>

      <div className="mt-5 flex gap-3">

        {(status === "PENDING") && (

          <button
            onClick={() =>
              onUpdate(
                item,
                "COOKING"
              )
            }
            className="flex-1 rounded-2xl bg-cyan-500 py-3 font-semibold text-black"
          >

            MAKE DRINK

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
