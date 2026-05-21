"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

import {
  ChefHat,
  Clock3,
  Flame,
  CheckCircle2,
  BellRing,
  Layers3,
  PlayCircle,
  Send,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import { supabase } from "@/lib/supabase";

import {
  canTransition,
} from "@/lib/orders/stateMachine";

export default function ExpoPage() {

  const [orders, setOrders] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  async function loadExpo() {

    setLoading(true);

    const {
      data: orderData,
    } = await supabase

      .from("orders")

      .select(`
        *,
        order_items (*)
      `)

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
          ascending: true,
        }
      );

    const filtered =
      (orderData || []).filter(
        order =>

          order.order_items?.some(
            item =>

              [
                "READY",
                "RELEASED",
                "SERVED",
              ].includes(
                item.status
              )
          )
      );

    setOrders(filtered);

    setLoading(false);

  }

  useEffect(() => {

    loadExpo();

    const channel =
      supabase

        .channel(
          "expo-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
          },
          loadExpo
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "order_items",
          },
          loadExpo
        )

        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );

    };

  }, []);

  async function releaseToFloor(
    item
  ) {

    if (
      !canTransition(
        item.status,
        "RELEASED"
      )
    ) {

      alert(
        `Invalid transition: ${item.status} -> RELEASED`
      );

      return;

    }

    await supabase

      .from("order_items")

      .update({

        status:
          "RELEASED",

        plated_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        item.id
      );

    await loadExpo();

  }

  async function fireNextCourse(
    order
  ) {

    const nextCourse =
      (
        order.current_course || 1
      ) + 1;

    await supabase

      .from("orders")

      .update({

        current_course:
          nextCourse,

      })

      .eq(
        "id",
        order.id
      );

    await supabase

      .from("order_items")

      .update({

        hold: false,

        status: "NEW",

        fire: true,

        fire_at:
          new Date().toISOString(),

      })

      .eq(
        "order_id",
        order.id
      )

      .eq(
        "course",
        nextCourse
      );

    await loadExpo();

  }

  const readyCount =
    useMemo(() => {

      return orders.reduce(
        (
          sum,
          order
        ) =>

          sum +

          order.order_items.filter(
            item =>
              item.status ===
              "READY"
          ).length,

        0
      );

    }, [orders]);

  return (

    <PageWrapper
      title="Expo Control"
      subtitle="Enterprise synchronization & release"
    >

      <div className="grid grid-cols-4 gap-5 mb-6">

        <Metric
          title="Ready"
          value={
            readyCount
          }
        />

        <Metric
          title="Tables"
          value={
            orders.length
          }
        />

        <Metric
          title="Rush"
          value={
            orders.filter(
              order =>

                order.order_items.some(
                  item =>
                    item.rush
                )
            ).length
          }
        />

        <Metric
          title="VIP"
          value={
            orders.filter(
              order =>

                order.order_items.some(
                  item =>
                    item.vip
                )
            ).length
          }
        />

      </div>

      {loading ? (

        <div className="text-white/40">
          Loading expo...
        </div>

      ) : (

        <div className="grid grid-cols-3 gap-6">

          {orders.map(
            order => {

            const readyItems =
              order.order_items.filter(
                item =>
                  item.status ===
                  "READY"
              );

            const releasedItems =
              order.order_items.filter(
                item =>
                  item.status ===
                  "RELEASED"
              );

            const servedItems =
              order.order_items.filter(
                item =>
                  item.status ===
                  "SERVED"
              );

            const futureCourses =
              order.order_items.filter(
                item =>

                  item.course >

                  (
                    order.current_course || 1
                  )
              );

            const urgent =
              readyItems.some(
                item =>
                  item.rush
              );

            const vip =
              readyItems.some(
                item =>
                  item.vip
              );

            return (

              <div
                key={order.id}
                className={`rounded-[30px] border overflow-hidden ${
                  urgent

                    ? "border-red-500/40 bg-red-500/10"

                    : vip

                    ? "border-yellow-500/40 bg-yellow-500/10"

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

                    <div className="text-right">

                      <div className="flex items-center gap-2 justify-end mb-2">

                        <Layers3 className="w-4 h-4 text-violet-400" />

                        <div className="text-sm uppercase text-white/40">

                          Course

                        </div>

                      </div>

                      <div className="text-3xl text-violet-400">

                        {
                          order.current_course || 1
                        }

                      </div>

                    </div>

                  </div>

                  <div className="grid grid-cols-3 gap-3">

                    <MetricMini
                      icon={
                        Clock3
                      }
                      label="Ready"
                      value={
                        readyItems.length
                      }
                    />

                    <MetricMini
                      icon={
                        Send
                      }
                      label="Released"
                      value={
                        releasedItems.length
                      }
                    />

                    <MetricMini
                      icon={
                        CheckCircle2
                      }
                      label="Served"
                      value={
                        servedItems.length
                      }
                    />

                  </div>

                </div>

                <div className="p-6 space-y-4">

                  {readyItems.map(
                    item => (

                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >

                        <div className="flex items-center justify-between mb-3">

                          <div>

                            <div className="text-xl">
                              {
                                item.item_name ||
                                "Dish"
                              }
                            </div>

                            <div className="flex gap-2 mt-2">

                              <span className="text-xs uppercase text-emerald-400">
                                READY
                              </span>

                              <span className="text-xs uppercase text-violet-400">
                                COURSE {
                                  item.course
                                }
                              </span>

                            </div>

                          </div>

                          <div className="text-lg">

                            x{
                              item.quantity
                            }

                          </div>

                        </div>

                        <button
                          onClick={() =>
                            releaseToFloor(
                              item
                            )
                          }
                          className="w-full h-11 rounded-2xl bg-emerald-500 text-black"
                        >

                          RELEASE TO FLOOR

                        </button>

                      </div>

                    )
                  )}

                  {futureCourses.length > 0 && (

                    <button
                      onClick={() =>
                        fireNextCourse(
                          order
                        )
                      }
                      className="w-full h-12 rounded-2xl bg-red-500 text-black flex items-center justify-center gap-2"
                    >

                      <PlayCircle className="w-5 h-5" />

                      FIRE NEXT COURSE

                    </button>

                  )}

                </div>

              </div>

            );

          })}

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

function MetricMini({
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
