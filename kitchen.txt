"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Clock3,
  CheckCircle2,
  ChefHat,
  Bell,
  Flame,
  TimerReset,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import { supabase } from "@/lib/supabase";

const STATIONS = [
  "HOT",
  "COLD",
  "BAR",
  "DESSERT",
];

export default function KitchenPage() {

  const [orders, setOrders] =
    useState([]);

  const [station, setStation] =
    useState("HOT");

  const [loading, setLoading] =
    useState(true);

  const [completedItems, setCompletedItems] =
    useState([]);

  async function loadKitchen() {

    setLoading(true);

    const {
      data: orderData,
      error: orderError,
    } = await supabase

      .from("orders")

      .select("*")

      .in(
        "status",
        [
          "OPEN",
          "BILLING",
        ]
      )

      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (orderError) {

      console.error(orderError);

      setOrders([]);

      setLoading(false);

      return;

    }

    if (!orderData?.length) {

      setOrders([]);

      setLoading(false);

      return;

    }

    const orderIds =
      orderData.map(
        order =>
          order.id
      );

    const {
      data: itemData,
      error: itemError,
    } = await supabase

      .from("order_items")

      .select("*")

      .in(
        "order_id",
        orderIds
      );

    if (itemError) {

      console.error(itemError);

      setOrders([]);

      setLoading(false);

      return;

    }

    const dishIds = [

      ...new Set(

        (itemData || [])

          .map(
            item =>
              item.dish_id
          )

          .filter(Boolean)

      ),

    ];

    let dishes = [];

    if (dishIds.length) {

      const {
        data,
      } = await supabase

        .from("dishes")

        .select("*")

        .in(
          "id",
          dishIds
        );

      dishes =
        data || [];

    }

    const dishMap = {};

    dishes.forEach(
      dish => {

        dishMap[
          dish.id
        ] = dish;

      }
    );

    const grouped = {};

    (itemData || []).forEach(
      item => {

        const dish =
          dishMap[
            item.dish_id
          ];

        const normalized = {

          ...item,

          dish_name:

            dish?.name ||

            item.item_name ||

            "Unnamed Dish",

          kitchen_station:

            item.station ||

            dish?.station ||

            "HOT",

          status:
            item.status ||
            "PENDING",

        };

        if (
          !grouped[
            item.order_id
          ]
        ) {

          grouped[
            item.order_id
          ] = [];

        }

        grouped[
          item.order_id
        ].push(
          normalized
        );

      }
    );

    const hydrated =
      orderData.map(
        order => ({

          ...order,

          order_items:

            grouped[
              order.id
            ] || [],

        })
      );

    setOrders(
      hydrated
    );

    setLoading(false);

  }

  useEffect(() => {

    loadKitchen();

    const channel =

      supabase

        .channel(
          "kitchen-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
          },
          loadKitchen
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          loadKitchen
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
    status
  ) {

    const {
      error,
    } = await supabase

      .from("order_items")

      .update({
        status,
      })

      .eq(
        "id",
        item.id
      );

    if (error) {

      alert(
        error.message
      );

      return;

    }

    if (
      status ===
      "SERVED"
    ) {

      setCompletedItems(
        prev => [

          {
            ...item,
            completed_at:
              new Date().toISOString(),
          },

          ...prev,

        ]
      );

    }

    await loadKitchen();

  }

  const visibleOrders =
    useMemo(() => {

      return orders.filter(
        order =>

          order.order_items?.some(
            item =>

              item.kitchen_station ===
                station &&

              item.status !==
                "SERVED"
          )
      );

    }, [
      orders,
      station,
    ]);

  const kitchenMetrics =
    useMemo(() => {

      let pending = 0;
      let preparing = 0;
      let ready = 0;

      visibleOrders.forEach(
        order => {

          order.order_items?.forEach(
            item => {

              if (
                item.kitchen_station !==
                station
              ) {
                return;
              }

              if (
                item.status ===
                "PENDING"
              ) {
                pending++;
              }

              if (
                item.status ===
                "PREPARING"
              ) {
                preparing++;
              }

              if (
                item.status ===
                "READY"
              ) {
                ready++;
              }

            }
          );

        }
      );

      return {
        pending,
        preparing,
        ready,
      };

    }, [
      visibleOrders,
      station,
    ]);

  return (

    <PageWrapper
      title="Kitchen"
      subtitle="Enterprise kitchen display system"
    >

      <div className="grid grid-cols-4 gap-5 mb-6">

        <Metric
          title="Pending"
          value={
            kitchenMetrics.pending
          }
        />

        <Metric
          title="Preparing"
          value={
            kitchenMetrics.preparing
          }
        />

        <Metric
          title="Ready"
          value={
            kitchenMetrics.ready
          }
        />

        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">

          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
            Station
          </div>

          <div className="text-5xl font-light">
            {
              station
            }
          </div>

        </div>

      </div>

      <div className="flex gap-3 mb-8">

        {STATIONS.map(
          item => (

            <button
              key={item}
              onClick={() =>
                setStation(item)
              }
              className={`h-12 px-6 rounded-2xl transition-all ${
                station === item

                  ? "bg-orange-500 text-black"

                  : "bg-white/5 text-white"
              }`}
            >

              {item}

            </button>

          )
        )}

      </div>

      {loading ? (

        <div className="text-white/40">
          Loading kitchen...
        </div>

      ) : (

        <div className="grid grid-cols-4 gap-6">

          <div className="col-span-3 grid grid-cols-2 gap-6">

            {visibleOrders.map(
              order => {

              const items =
                order.order_items.filter(
                  item =>

                    item.kitchen_station ===
                      station &&

                    item.status !==
                      "SERVED"
                );

              if (!items.length)
                return null;

              const orderCreatedAt =

                order.created_at ||

                items?.[0]?.created_at ||

                new Date().toISOString();

              const waitMinutes =
                (() => {

                  const created =
                    new Date(
                      orderCreatedAt
                    ).getTime();

                  if (
                    !created ||

                    Number.isNaN(
                      created
                    )
                  ) {
                    return 0;
                  }

                  return Math.max(
                    0,

                    Math.floor(

                      (
                        Date.now() -

                        created

                      ) / 60000

                    )
                  );

                })();

              const urgent =
                waitMinutes >= 15;

              return (

                <div
                  key={order.id}
                  className={`rounded-[30px] border overflow-hidden ${
                    urgent

                      ? "border-red-500/40 bg-red-500/10"

                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >

                  <div className="p-6 border-b border-white/5">

                    <div className="flex items-start justify-between mb-5">

                      <div>

                        <div className="text-xs uppercase tracking-[0.2em] text-orange-400 mb-2">
                          Table
                        </div>

                        <div className="text-5xl font-light">
                          {
                            order.table_number
                          }
                        </div>

                      </div>

                      {urgent ? (

                        <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center">

                          <Flame className="w-6 h-6 text-black" />

                        </div>

                      ) : (

                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">

                          <ChefHat className="w-6 h-6 text-white/60" />

                        </div>

                      )}

                    </div>

                    <div className="grid grid-cols-2 gap-3">

                      <div className="rounded-2xl border border-white/10 p-4">

                        <div className="flex items-center gap-2 text-xs uppercase text-white/40 mb-2">

                          <Clock3 className="w-4 h-4" />

                          Wait

                        </div>

                        <div className={`text-3xl ${
                          urgent
                            ? "text-red-400"
                            : ""
                        }`}>

                          {
                            waitMinutes
                          }m

                        </div>

                      </div>

                      <div className="rounded-2xl border border-white/10 p-4">

                        <div className="flex items-center gap-2 text-xs uppercase text-white/40 mb-2">

                          <Bell className="w-4 h-4" />

                          Items

                        </div>

                        <div className="text-3xl">

                          {
                            items.length
                          }

                        </div>

                      </div>

                    </div>

                  </div>

                  <div className="p-6 space-y-4">

                    {items.map(
                      item => (

                        <div
                          key={item.id}
                          className="rounded-2xl border border-white/10 bg-black/20 p-4"
                        >

                          <div className="flex items-center justify-between mb-4">

                            <div>

                              <div className="text-xl">

                                {
                                  item.dish_name
                                }

                              </div>

                              <div className="text-xs uppercase text-white/40 mt-1">

                                {
                                  item.status
                                }

                              </div>

                            </div>

                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-lg">

                              x{
                                item.quantity
                              }

                            </div>

                          </div>

                          <div className="flex gap-2">

                            {item.status ===
                              "PENDING" && (

                              <button
                                onClick={() =>
                                  updateItemStatus(
                                    item,
                                    "PREPARING"
                                  )
                                }
                                className="flex-1 h-11 rounded-2xl bg-orange-500 text-black"
                              >
                                START
                              </button>

                            )}

                            {item.status ===
                              "PREPARING" && (

                              <button
                                onClick={() =>
                                  updateItemStatus(
                                    item,
                                    "READY"
                                  )
                                }
                                className="flex-1 h-11 rounded-2xl bg-emerald-500 text-black"
                              >
                                READY
                              </button>

                            )}

                            {item.status ===
                              "READY" && (

                              <button
                                onClick={() =>
                                  updateItemStatus(
                                    item,
                                    "SERVED"
                                  )
                                }
                                className="flex-1 h-11 rounded-2xl bg-violet-500 text-white"
                              >
                                SERVED
                              </button>

                            )}

                          </div>

                        </div>

                      )
                    )}

                  </div>

                </div>

              );

            })}

          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden h-fit">

            <div className="p-6 border-b border-white/5 flex items-center gap-3">

              <CheckCircle2 className="w-5 h-5 text-emerald-400" />

              <div className="text-2xl font-light">
                Completed
              </div>

            </div>

            <div className="p-6 space-y-3">

              {completedItems.map(
                item => (

                  <div
                    key={`${item.id}-${item.completed_at}`}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4"
                  >

                    <div className="flex items-center justify-between mb-2">

                      <div className="text-lg">

                        {
                          item.dish_name
                        }

                      </div>

                      <div>

                        x{
                          item.quantity
                        }

                      </div>

                    </div>

                    <div className="flex items-center gap-2 text-xs uppercase text-white/40">

                      <TimerReset className="w-4 h-4" />

                      Served

                    </div>

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      )}

    </PageWrapper>

  );

}

function Metric({
  title,
  value,
}) {

  return (

    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">

      <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">

        {title}

      </div>

      <div className="text-5xl font-light">

        {value}

      </div>

    </div>

  );

}
