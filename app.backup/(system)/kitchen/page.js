"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

import {
  Clock3,
  PauseCircle,
  CheckCircle2,
  Layers3,
  Activity,
  Flame,
  BellRing,
  Crown,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import { supabase } from "@/lib/supabase";

import {
  canTransition,
} from "@/lib/orders/stateMachine";

import {
  buildAllDayCounts,
} from "@/lib/kitchen/allDayCounts";

import {
  buildProductionMetrics,
} from "@/lib/kitchen/productionMetrics";

const STATIONS = [
  "HOT",
  "COLD",
  "BAR",
  "DESSERT",
];

function getTimer(item) {

  const start =
    item.kitchen_started_at ||
    item.created_at;

  if (!start) return 0;

  return Math.max(
    0,
    Math.floor(
      (
        Date.now() -
        new Date(start).getTime()
      ) / 60000
    )
  );

}

export default function KitchenPage() {

  const [orders, setOrders] =
    useState([]);

  const [station, setStation] =
    useState("HOT");

  const [loading, setLoading] =
    useState(true);

  async function loadKitchen() {

    setLoading(true);

    const {
      data,
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

    setOrders(
      data || []
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

  async function updateStatus(
    item,
    status
  ) {

    if (
      !canTransition(
        item.status,
        status
      )
    ) {

      alert(
        `Invalid transition: ${item.status} -> ${status}`
      );

      return;

    }

    const updateData = {
      status,
    };

    if (
      status === "COOKING"
    ) {

      updateData.kitchen_started_at =
        new Date().toISOString();

    }

    if (
      status === "READY"
    ) {

      updateData.ready_at =
        new Date().toISOString();

    }

    await supabase

      .from("order_items")

      .update(
        updateData
      )

      .eq(
        "id",
        item.id
      );

    await loadKitchen();

  }

  async function toggleHold(
    item
  ) {

    const nextStatus =
      item.status === "HOLD"
        ? "NEW"
        : "HOLD";

    if (
      !canTransition(
        item.status,
        nextStatus
      )
    ) {

      alert(
        `Invalid transition: ${item.status} -> ${nextStatus}`
      );

      return;

    }

    await supabase

      .from("order_items")

      .update({

        hold:
          !item.hold,

        status:
          nextStatus,

      })

      .eq(
        "id",
        item.id
      );

    await loadKitchen();

  }

  async function fireItem(
    item
  ) {

    if (
      !canTransition(
        item.status,
        "NEW"
      )
    ) {

      alert(
        `Invalid transition: ${item.status} -> NEW`
      );

      return;

    }

    await supabase

      .from("order_items")

      .update({

        fire: true,

        hold: false,

        status:
          "NEW",

        fire_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        item.id
      );

    await loadKitchen();

  }

  const visibleOrders =
    useMemo(() => {

      return orders.filter(
        order =>

          order.order_items?.some(
            item =>

              item.station ===
                station &&

              item.course <=
                (
                  order.current_course || 1
                ) &&

              ![
                "SERVED",
                "CANCELLED",
                "CLOSED",
              ].includes(
                item.status
              )
          )
      );

    }, [
      orders,
      station,
    ]);

  const allDayCounts =
    useMemo(() => {

      return buildAllDayCounts(
        orders,
        station
      );

    }, [
      orders,
      station,
    ]);

  const metrics =
    useMemo(() => {

      return buildProductionMetrics(
        orders,
        station
      );

    }, [
      orders,
      station,
    ]);

  return (

    <PageWrapper
      title="Kitchen"
      subtitle="Enterprise kitchen production control"
    >

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

      <div className="grid grid-cols-6 gap-4 mb-8">

        <MetricCard
          icon={Layers3}
          label="TOTAL"
          value={
            metrics.totalItems
          }
        />

        <MetricCard
          icon={Activity}
          label="COOKING"
          value={
            metrics.cookingItems
          }
        />

        <MetricCard
          icon={CheckCircle2}
          label="READY"
          value={
            metrics.readyItems
          }
        />

        <MetricCard
          icon={Flame}
          label="RUSH"
          value={
            metrics.rushItems
          }
        />

        <MetricCard
          icon={Crown}
          label="VIP"
          value={
            metrics.vipItems
          }
        />

        <MetricCard
          icon={Clock3}
          label={metrics.health}
          value={`${metrics.avgWait}m`}
          alert={
            metrics.health
          }
        />

      </div>

      <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6 mb-8">

        <div className="flex items-center gap-3 mb-6">

          <Layers3 className="w-6 h-6 text-orange-400" />

          <div className="text-2xl">
            ALL DAY COUNTS
          </div>

        </div>

        <div className="grid grid-cols-4 gap-4">

          {allDayCounts.map(
            item => (

              <div
                key={item.name}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >

                <div className="text-xl mb-4">
                  {item.name}
                </div>

                <div className="grid grid-cols-3 gap-2">

                  <MiniMetric
                    label="TOTAL"
                    value={
                      item.quantity
                    }
                  />

                  <MiniMetric
                    label="COOK"
                    value={
                      item.cooking
                    }
                  />

                  <MiniMetric
                    label="READY"
                    value={
                      item.ready
                    }
                  />

                </div>

              </div>

            )
          )}

        </div>

      </div>

      {loading ? (

        <div className="text-white/40">
          Loading kitchen...
        </div>

      ) : (

        <div className="grid grid-cols-3 gap-6">

          {visibleOrders.map(
            order => {

            const items =
              order.order_items.filter(
                item =>

                  item.station ===
                    station &&

                  item.course <=
                    (
                      order.current_course || 1
                    ) &&

                  ![
                    "SERVED",
                    "CANCELLED",
                    "CLOSED",
                  ].includes(
                    item.status
                  )
              );

            if (!items.length)
              return null;

            return (

              <div
                key={order.id}
                className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden"
              >

                <div className="p-6 border-b border-white/5">

                  <div className="flex items-start justify-between">

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

                      <div className="text-xs uppercase text-white/40 mb-2">
                        Course
                      </div>

                      <div className="text-3xl text-violet-400">

                        {
                          order.current_course || 1
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

                        <div className="flex justify-between mb-4">

                          <div>

                            <div className="text-xl">
                              {
                                item.item_name
                              }
                            </div>

                            <div className="flex gap-2 mt-2">

                              <span className="text-xs uppercase text-white/40">
                                {
                                  item.status
                                }
                              </span>

                              <span className="text-xs uppercase text-violet-400">
                                COURSE {
                                  item.course
                                }
                              </span>

                            </div>

                          </div>

                          <div className="text-right">

                            <div className="text-xl">

                              {
                                getTimer(
                                  item
                                )
                              }m

                            </div>

                            <div className="text-xs text-white/40">

                              x{
                                item.quantity
                              }

                            </div>

                          </div>

                        </div>

                        <div className="flex gap-2 flex-wrap">

                          {item.status ===
                            "HOLD" && (

                            <button
                              onClick={() =>
                                fireItem(
                                  item
                                )
                              }
                              className="flex-1 h-10 rounded-xl bg-red-500 text-black"
                            >

                              FIRE

                            </button>

                          )}

                          {[
                            "NEW",
                            "HOLD",
                          ].includes(
                            item.status
                          ) && (

                            <button
                              onClick={() =>
                                toggleHold(
                                  item
                                )
                              }
                              className="flex-1 h-10 rounded-xl bg-yellow-500 text-black"
                            >

                              <PauseCircle className="w-4 h-4 mx-auto" />

                            </button>

                          )}

                          {item.status ===
                            "NEW" && (

                            <button
                              onClick={() =>
                                updateStatus(
                                  item,
                                  "COOKING"
                                )
                              }
                              className="flex-1 h-10 rounded-xl bg-orange-500 text-black"
                            >

                              START

                            </button>

                          )}

                          {item.status ===
                            "COOKING" && (

                            <button
                              onClick={() =>
                                updateStatus(
                                  item,
                                  "READY"
                                )
                              }
                              className="flex-1 h-10 rounded-xl bg-emerald-500 text-black"
                            >

                              READY

                            </button>

                          )}

                          {item.status ===
                            "READY" && (

                            <div className="flex items-center gap-2 text-emerald-400 text-sm uppercase">

                              <CheckCircle2 className="w-4 h-4" />

                              Awaiting Expo

                            </div>

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

      )}

    </PageWrapper>

  );

}

function MetricCard({
  icon: Icon,
  label,
  value,
  alert,
}) {

  const alertClass =

    alert === "CRITICAL"

      ? "border-red-500/40 bg-red-500/10"

      : alert === "BAD"

      ? "border-orange-500/40 bg-orange-500/10"

      : alert === "WARNING"

      ? "border-yellow-500/40 bg-yellow-500/10"

      : "border-white/10 bg-white/[0.03]";

  return (

    <div
      className={`rounded-[28px] border p-5 ${alertClass}`}
    >

      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/40 mb-3">

        <Icon className="w-4 h-4" />

        {label}

      </div>

      <div className="text-4xl font-light">
        {value}
      </div>

    </div>

  );

}

function MiniMetric({
  label,
  value,
}) {

  return (

    <div className="rounded-xl border border-white/10 p-3">

      <div className="text-[10px] uppercase text-white/40 mb-1">
        {label}
      </div>

      <div className="text-xl">
        {value}
      </div>

    </div>

  );

}
