"use client";
import { subscribe } from "@/lib/pos/core/posEventEngine";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

import {
  CheckCircle2,
  BellRing,
} from "lucide-react";

import { supabase }
from "@/lib/shared/supabase/client";
import { acknowledgeOrder } from "./ack_patch";



export default function ExpoPage() {

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

  async function loadExpo() {

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

    loadExpo();

    const channel =
      supabase

        .channel("expo-live")

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          () => {
            loadExpo();
          }
        )

        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );

    };

  }, []);

  async function serveTable(
    items
  ) {

    const ids =
      items.map(
        i => i.id
      );

    const { error } =
      await supabase

        .from("order_items")

        .update({

          status:
            "SERVED",

        })

        .in(
          "id",
          ids
        );

    if (error) {

      console.error(error);

      return;

    }

    loadExpo();

  }

  const readyTables =
    useMemo(() => {

      const readyItems =
        orders.flatMap(
          order =>

            (order.order_items || [])

              .filter(
                item =>
                  item.status ===
                  "READY"
              )

              .map(
                item => ({
                  ...item,
                  table_number:
                    order.table_number,
                })
              )
        );

      const grouped = {};

      for (
        const item of readyItems
      ) {

        const table =
          item.table_number;

        if (
          !grouped[table]
        ) {

          grouped[table] = [];

        }

        grouped[table].push(
          item
        );

      }

      return grouped;

    }, [orders]);

  return (

    <div className="min-h-screen bg-[#111111] p-8 text-white">

      <div className="mb-10 flex items-center justify-between">

        <div>

          <h1 className="text-5xl font-bold tracking-tight">

            Expo Control

          </h1>

          <p className="mt-3 text-lg text-zinc-500">

            Ready tables & service coordination

          </p>

        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-4">

          <div className="mb-2 flex items-center gap-2 text-zinc-500">

            <BellRing size={18} />

            READY TABLES

          </div>

          <div className="text-4xl font-bold">

            {
              Object.keys(
                readyTables
              ).length
            }

          </div>

        </div>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading expo...
        </div>

      ) : (

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

          {Object.entries(
            readyTables
          ).map(
            ([table, items]) => (

              <div
                key={table}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
              >

                <div className="mb-6 flex items-center justify-between">

                  <div>

                    <div className="text-sm text-zinc-500">

                      TABLE

                    </div>

                    <div className="text-4xl font-bold">

                      {table}

                    </div>

                  </div>

                  <CheckCircle2
                    size={36}
                    className="text-green-400"
                  />

                </div>

                <div className="space-y-3">

                  {items.map(
                    item => (

                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-4 py-3"
                      >

                        <div>

                          <div className="text-xl font-semibold">

                            {
                              item.item_name
                            }

                          </div>

                          <div className="text-sm text-zinc-500">

                            Qty:
                            {" "}
                            {item.quantity}

                          </div>

                        </div>

                        <div className="text-green-400 font-bold">

                          READY

                        </div>

                      </div>

                    )
                  )}

                </div>

                <button
                  onClick={() =>
                    serveTable(
                      items
                    )
                  }
                  className="mt-6 w-full rounded-2xl bg-green-500 py-4 text-lg font-bold text-black"
                >

                  SERVE TABLE

                </button>

              </div>

            )
          )}

        </div>

      )}

    </div>

  );

}


// AUTO ACK HOOK (SAFE)
// NOTE: integrate inside loadKitchen() manually if needed
  // ===== EVENT SYNC (EXPO) =====
  useEffect(() => {

    const unsub = subscribe("EXPO", () => {
      loadExpo();
    });

    return () => unsub();

  }, []);

