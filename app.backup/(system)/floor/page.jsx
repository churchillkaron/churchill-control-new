"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Clock3,
  Receipt,
  ChefHat,
  CheckCircle2,
  Layers3,
  Send,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import { supabase } from "@/lib/supabase";

import {
  canTransition,
} from "@/lib/orders/stateMachine";

import {
  processCourseFlow,
} from "@/lib/orders/autoCourseFlow";

import {
  canRequestBill,
  canCloseTable,
} from "@/lib/orders/tableLifecycle";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function FloorPage() {

  const router =
    useRouter();

  const [tables, setTables] =
    useState([]);

  const [orders, setOrders] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  async function loadFloor() {

    setLoading(true);

    const {
      data: tableData,
    } = await supabase

      .from("restaurant_tables")

      .select("*")

      .eq(
        "tenant_id",
        TENANT_ID
      )

      .order(
        "table_name",
        {
          ascending: true,
        }
      );

    const {
      data: orderData,
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

      .in(
        "status",
        [
          "OPEN",
          "READY",
          "BILLING",
        ]
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    setTables(
      tableData || []
    );

    setOrders(
      orderData || []
    );

    setLoading(false);

  }

  useEffect(() => {

    loadFloor();

    const channel =
      supabase

        .channel(
          "floor-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "restaurant_tables",
          },
          loadFloor
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
          },
          loadFloor
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          loadFloor
        )

        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );

    };

  }, []);

  async function markServed(
    order,
    item
  ) {

    if (
      !canTransition(
        item.status,
        "SERVED"
      )
    ) {

      alert(
        `Invalid transition: ${item.status} -> SERVED`
      );

      return;

    }

    await supabase

      .from("order_items")

      .update({

        status:
          "SERVED",

        served_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        item.id
      );

    const {
      data: refreshedOrder,
    } = await supabase

      .from("orders")

      .select(`
        *,
        order_items (*)
      `)

      .eq(
        "id",
        order.id
      )

      .single();

    await processCourseFlow(
      supabase,
      refreshedOrder
    );

    await loadFloor();

  }

  async function requestBill(
    order
  ) {

    if (
      !canRequestBill(
        order
      )
    ) {

      alert(
        "Cannot request bill with active items"
      );

      return;

    }

    await supabase

      .from("orders")

      .update({
        status:
          "BILLING",
      })

      .eq(
        "id",
        order.id
      );

    await loadFloor();

  }

  async function completeTable(
    order
  ) {

    if (
      !canCloseTable(
        order
      )
    ) {

      alert(
        "Cannot close table yet"
      );

      return;

    }

    await supabase

      .from("orders")

      .update({
        status:
          "CLOSED",
      })

      .eq(
        "id",
        order.id
      );

    await supabase

      .from(
        "restaurant_tables"
      )

      .update({
        status:
          "AVAILABLE",
      })

      .eq(
        "table_name",
        order.table_number
      );

    await loadFloor();

  }

  const mappedTables =
    useMemo(() => {

      return tables.map(
        table => {

        const tableName =

          table.table_name ||

          table.table_number ||

          table.name;

        const activeOrder =
          orders.find(
            order =>

              order.table_number ===
              tableName
          );

        const releasedItems =
          activeOrder?.order_items?.filter(
            item =>
              item.status ===
              "RELEASED"
          ) || [];

        const servedItems =
          activeOrder?.order_items?.filter(
            item =>
              item.status ===
              "SERVED"
          ) || [];

        const cookingItems =
          activeOrder?.order_items?.filter(
            item =>
              item.status ===
              "COOKING"
          ) || [];

        return {

          ...table,

          tableName,

          activeOrder,

          releasedItems,

          servedItems,

          cookingItems,

        };

      });

    }, [
      tables,
      orders,
    ]);

  return (

    <PageWrapper
      title="Floor Control"
      subtitle="Enterprise dining orchestration"
    >

      {loading ? (

        <div className="text-white/40">
          Loading floor...
        </div>

      ) : (

        <div className="grid grid-cols-4 gap-6">

          {mappedTables.map(
            table => (

              <div
                key={table.id}
                className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden"
              >

                <div className="p-6 border-b border-white/5">

                  <div className="flex items-start justify-between mb-6">

                    <div>

                      <div className="text-xs uppercase tracking-[0.2em] text-violet-400 mb-2">
                        Table
                      </div>

                      <div className="text-5xl font-light">
                        {
                          table.tableName
                        }
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="flex items-center gap-2 justify-end mb-2">

                        <Layers3 className="w-4 h-4 text-violet-400" />

                        <div className="text-xs uppercase text-white/40">

                          Course

                        </div>

                      </div>

                      <div className="text-3xl text-violet-400">

                        {
                          table.activeOrder?.current_course || 1
                        }

                      </div>

                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-3">

                    <Metric
                      icon={ChefHat}
                      label="Cooking"
                      value={
                        table.cookingItems.length
                      }
                    />

                    <Metric
                      icon={CheckCircle2}
                      label="Served"
                      value={
                        table.servedItems.length
                      }
                    />

                  </div>

                </div>

                <div className="p-6 space-y-3">

                  {table.releasedItems.map(
                    item => (

                      <button
                        key={item.id}
                        onClick={() =>
                          markServed(
                            table.activeOrder,
                            item
                          )
                        }
                        className="w-full h-12 rounded-2xl bg-emerald-500 text-black flex items-center justify-center gap-2"
                      >

                        <Send className="w-4 h-4" />

                        SERVE {
                          item.item_name
                        }

                      </button>

                    )
                  )}

                  {table.activeOrder?.status !==
                    "BILLING" && (

                    <button
                      onClick={() =>
                        requestBill(
                          table.activeOrder
                        )
                      }
                      className="w-full h-12 rounded-2xl bg-orange-500 text-black"
                    >

                      REQUEST BILL

                    </button>

                  )}

                  {table.activeOrder?.status ===
                    "BILLING" && (

                    <>
                      <button
                        onClick={() =>
                          router.push(
                            `/pos/payments?order_id=${table.activeOrder.id}`
                          )
                        }
                        className="w-full h-12 rounded-2xl bg-emerald-500 text-black"
                      >

                        OPEN PAYMENT

                      </button>

                      <button
                        onClick={() =>
                          completeTable(
                            table.activeOrder
                          )
                        }
                        className="w-full h-12 rounded-2xl bg-violet-500 text-white"
                      >

                        CLOSE TABLE

                      </button>
                    </>

                  )}

                </div>

              </div>

            )
          )}

        </div>

      )}

    </PageWrapper>

  );

}

function Metric({
  icon: Icon,
  label,
  value,
}) {

  return (

    <div className="rounded-2xl border border-white/10 p-4">

      <div className="flex items-center gap-2 text-xs uppercase text-white/40 mb-2">

        <Icon className="w-4 h-4" />

        {label}

      </div>

      <div className="text-2xl">

        {value}

      </div>

    </div>

  );

}
