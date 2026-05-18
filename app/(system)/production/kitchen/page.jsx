"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionKitchenPage() {

  const [
    tickets,
    setTickets,
  ] = useState([]);

  const [
    selectedStatus,
    setSelectedStatus,
  ] = useState("ALL");

  // ===== LOAD =====
  async function loadTickets() {

    let query =
      supabase
        .from(
          "kitchen_ticket_items"
        )
        .select("*")
        .neq(
          "status",
          "SERVED"
        )
        .neq(
          "status",
          "CANCELLED"
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

    if (
      selectedStatus !==
      "ALL"
    ) {

      query =
        query.eq(
          "status",
          selectedStatus
        );
    }

    const {
      data,
      error,
    } = await query;

    if (!error) {

      setTickets(
        data || []
      );
    }
  }

  // ===== STATUS =====
  async function updateStatus(
    id,
    status
  ) {

    const updateData = {
      status,
    };

    if (
      status === "PREPARING"
    ) {

      updateData.fire_time =
        new Date().toISOString();
    }

    if (
      status === "READY"
    ) {

      updateData.ready_time =
        new Date().toISOString();
    }

    const {
      error,
    } = await supabase
      .from(
        "kitchen_ticket_items"
      )
      .update(
        updateData
      )
      .eq(
        "id",
        id
      );

    if (!error) {

      await loadTickets();
    }
  }

  // ===== REALTIME =====
  useEffect(() => {

    loadTickets();

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
            table:
              "kitchen_ticket_items",
          },
          () => {

            loadTickets();
          }
        )
        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );
    };

  }, [
    selectedStatus,
  ]);

  function getElapsedMinutes(
    createdAt
  ) {

    const now =
      new Date();

    const created =
      new Date(
        createdAt
      );

    return Math.floor(
      (
        now - created
      ) / 1000 / 60
    );
  }

  function getStationColor(
    station
  ) {

    switch (station) {

      case "BAR":
        return "text-cyan-400";

      case "GRILL":
        return "text-orange-400";

      case "DESSERT":
        return "text-pink-400";

      case "COLD":
        return "text-emerald-400";

      default:
        return "text-violet-400";
    }
  }

  return (

    <div className="min-h-screen bg-black text-white overflow-hidden">

      {/* ===== HEADER ===== */}
      <div className="h-24 border-b border-white/5 flex items-center justify-between px-10">

        <div>

          <div className="text-[11px] uppercase tracking-[0.3em] text-orange-400 mb-2">
            KITCHEN
          </div>

          <div className="text-5xl font-semibold tracking-tight">
            Production Line
          </div>

        </div>

        <div className="flex gap-3">

          {[
            "ALL",
            "PENDING",
            "PREPARING",
            "READY",
          ].map((status) => (

            <button
              key={status}
              onClick={() =>
                setSelectedStatus(
                  status
                )
              }
              className={`h-12 px-6 rounded-2xl transition-all text-sm tracking-widest ${
                selectedStatus === status
                  ? "bg-orange-500 text-black"
                  : "bg-white/[0.04] border border-white/5 text-zinc-400 hover:border-orange-500/30"
              }`}
            >
              {status}
            </button>
          ))}

        </div>

      </div>

      {/* ===== GRID ===== */}
      <div className="p-8 overflow-auto h-[calc(100vh-96px)]">

        {tickets.length === 0 ? (

          <div className="h-full flex items-center justify-center text-zinc-600 text-2xl">
            No kitchen tickets
          </div>

        ) : (

          <div className="grid grid-cols-4 gap-6">

            {tickets.map(
              (
                ticket
              ) => {

                const elapsed =
                  getElapsedMinutes(
                    ticket.created_at
                  );

                return (

                  <div
                    key={ticket.id}
                    className={`rounded-[32px] border overflow-hidden transition-all ${
                      ticket.status === "READY"
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : ticket.status === "PREPARING"
                        ? "border-orange-500/40 bg-orange-500/5"
                        : "border-white/5 bg-zinc-950"
                    }`}
                  >

                    {/* ===== TOP ===== */}
                    <div className="p-6 border-b border-white/5">

                      <div className="flex items-start justify-between mb-4">

                        <div>

                          <div className="text-3xl font-medium leading-tight">
                            {
                              ticket.item_name
                            }
                          </div>

                          <div className={`uppercase tracking-widest text-xs mt-2 ${
                            getStationColor(
                              ticket.station
                            )
                          }`}>
                            {
                              ticket.station
                            }
                          </div>

                        </div>

                        <div className="text-right">

                          <div className="text-5xl font-light">
                            {
                              ticket.quantity
                            }
                          </div>

                          <div className="text-zinc-500 text-xs mt-2">
                            QTY
                          </div>

                        </div>

                      </div>

                      <div className="flex items-center justify-between">

                        <div className={`text-sm tracking-widest ${
                          elapsed >= 15
                            ? "text-red-400"
                            : elapsed >= 8
                            ? "text-orange-400"
                            : "text-emerald-400"
                        }`}>
                          {elapsed} MIN
                        </div>

                        <div className={`px-4 h-10 rounded-2xl flex items-center text-sm tracking-widest ${
                          ticket.status === "READY"
                            ? "bg-emerald-500 text-black"
                            : ticket.status === "PREPARING"
                            ? "bg-orange-500 text-black"
                            : "bg-zinc-800 text-zinc-300"
                        }`}>
                          {
                            ticket.status
                          }
                        </div>

                      </div>

                    </div>

                    {/* ===== ACTIONS ===== */}
                    <div className="p-6 flex flex-col gap-4">

                      {ticket.status ===
                        "PENDING" && (

                        <button
                          onClick={() =>
                            updateStatus(
                              ticket.id,
                              "PREPARING"
                            )
                          }
                          className="h-16 rounded-3xl bg-orange-500 hover:bg-orange-400 text-black font-semibold text-lg transition-all"
                        >
                          START COOKING
                        </button>
                      )}

                      {ticket.status ===
                        "PREPARING" && (

                        <button
                          onClick={() =>
                            updateStatus(
                              ticket.id,
                              "READY"
                            )
                          }
                          className="h-16 rounded-3xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-lg transition-all"
                        >
                          READY TO SERVE
                        </button>
                      )}

                      {ticket.status ===
                        "READY" && (

                        <button
                          onClick={() =>
                            updateStatus(
                              ticket.id,
                              "SERVED"
                            )
                          }
                          className="h-16 rounded-3xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-lg transition-all"
                        >
                          SERVED
                        </button>
                      )}

                    </div>

                  </div>
                );
              }
            )}

          </div>

        )}

      </div>

    </div>
  );
}
