"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Users,
  Receipt,
  CreditCard,
} from "lucide-react";

import { useRouter }
from "next/navigation";

import { supabase }
from "@/lib/shared/supabase/client";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function TablesPage() {

  const router =
    useRouter();

  const [
    tables,
    setTables,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function loadTables() {

    setLoading(true);

    const {
      data: tablesData,
      error: tablesError,
    } = await supabase

      .from(
        "restaurant_tables"
      )

      .select("*")

      .eq(
        "tenant_id",
        TENANT_ID
      )

      .order(
        "table_name"
      );

    if (tablesError) {

      console.error(
        tablesError
      );

      setLoading(false);

      return;

    }

    const {
      data: ordersData,
      error: ordersError,
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

      .not(
        "status",
        "in",
        "(PAID,CLOSED)"
      );

    if (ordersError) {

      console.error(
        ordersError
      );

      setLoading(false);

      return;

    }

    const mergedTables =
      (tablesData || []).map(
        table => ({

          ...table,

          orders:
            (ordersData || []).filter(
              order =>
                order.table_number ===
                table.table_name
            ),

        })
      );

    setTables(
      mergedTables
    );

    setLoading(false);

  }

useEffect(() => {

    loadTables();

    const channel =
      supabase

        .channel("tables-live")

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
          },
          loadTables
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          loadTables
        )

        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );

    };

  }, []);

  const activeTables =
    useMemo(() => {

      return tables.map(
        table => {

          const activeOrders =
            (table.orders || [])

              .filter(
                order =>

                  !["PAID","CLOSED"].includes(order.status)
              );

          const items =
            activeOrders.flatMap(
              order =>
                order.order_items || []
            );

          const total =
            items.reduce(
              (
                sum,
                item
              ) =>

                sum +
                (
                  Number(item.price || 0) *
                  Number(item.quantity || 1)
                ),

              0
            );

          return {

            ...table,

            activeOrders,

            items,

            total,

          };

        }
      );

    }, [tables]);

  return (

    <div className="min-h-screen bg-black p-8 text-white">

      <div className="mb-10 flex items-center justify-between">

        <div>

          <h1 className="text-5xl font-bold tracking-tight">

            Table Operations

          </h1>

          <p className="mt-3 text-lg text-zinc-500">

            Live floor control

          </p>

        </div>

      </div>

      {loading ? (

        <div className="text-zinc-500">
          Loading tables...
        </div>

      ) : (

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">

          {activeTables.map(
            table => {

              const occupied =
                table.activeOrders
                  .length > 0;

              return (

                <div
                  key={table.id}
                  className={`rounded-3xl border p-6 transition-all ${
                    occupied
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-zinc-800 bg-zinc-950"
                  }`}
                >

                  <div className="mb-6 flex items-center justify-between">

                    <div>

                      <div className="text-sm text-zinc-500">

                        TABLE

                      </div>

                      <div className="text-4xl font-bold">

                        {
                          table.table_name
                        }

                      </div>

                    </div>

                    <Users
                      size={34}
                      className={
                        occupied
                          ? "text-orange-400"
                          : "text-zinc-600"
                      }
                    />

                  </div>

                  <div className="mb-6 space-y-2 text-sm text-zinc-400">

                    <div>

                      Status:
                      {" "}
                      <span className="font-bold text-white">

                        {occupied
                          ? "OCCUPIED"
                          : "AVAILABLE"}

                      </span>

                    </div>

                    <div>

                      Orders:
                      {" "}
                      {
                        table.activeOrders
                          .length
                      }

                    </div>

                    <div className="space-y-3">

                      <div>

                        Items:
                        {" "}
                        {
                          table.items
                            .length
                        }

                      </div>

                      <div className="max-h-56 overflow-y-auto rounded-2xl border border-zinc-800 bg-black/40 p-3">

                        <div className="space-y-2">

                          {table.items.map(
                            item => (

                              <div
                                key={item.id}
                                className="rounded-xl border border-zinc-800 bg-black/50 p-3"
                              >

                                <div className="flex items-center justify-between">

                                  <div>

                                    <div className="font-semibold text-white">

                                      {
                                        item.item_name
                                      }

                                    </div>

                                    <div className="mt-1 text-xs text-zinc-500">

                                      Qty:
                                      {" "}
                                      {item.quantity}

                                    </div>

                                  </div>

                                  <div className="text-right">

                                    <div className="font-bold text-white">

                                      ฿
                                      {
                                        Number(
                                          item.price || 0
                                        ).toLocaleString()
                                      }

                                    </div>

                                    <div
                                      className={`mt-1 text-xs font-bold ${
                                        item.status === "READY"
                                          ? "text-green-400"
                                          : item.status === "COOKING"
                                          ? "text-orange-400"
                                          : item.status === "SERVED"
                                          ? "text-cyan-400"
                                          : "text-zinc-500"
                                      }`}
                                    >

                                      {item.status}

                                    </div>

                                  </div>

                                </div>

                              </div>

                            )
                          )}

                        </div>

                      </div>

                    </div>

                    <div>

                      Total:
                      {" "}
                      ฿
                      {
                        table.total
                          .toLocaleString()
                      }

                    </div>

                  </div>

                  {occupied && (

                    <div className="space-y-3">

                      <button
                        onClick={() =>
                          router.push(
                            `/pos/orders?table=${table.table_name}`
                          )
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-800 py-3 font-semibold"
                      >

                        <Receipt
                          size={18}
                        />

                        OPEN ORDER

                      </button>

                      <button
                        onClick={() =>
                          router.push(
                            `/pos/payments?order_id=${table.activeOrders[0]?.id}`
                          )
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-500 py-3 font-semibold text-black"
                      >

                        <CreditCard
                          size={18}
                        />

                        PAYMENT

                      </button>

                    </div>

                  )}

                </div>

              );

            }
          )}

        </div>

      )}

    </div>

  );

}
