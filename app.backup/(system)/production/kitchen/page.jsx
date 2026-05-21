"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionKitchenPage() {

  const [
    tickets,
    setTickets,
  ] = useState([]);

  // ===== LOAD =====
  async function loadTickets() {

    const {
      data,
      error,
    } = await supabase
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

    if (!error) {

      setTickets(
        data || []
      );
    }
  }

  // ===== UPDATE =====
  async function updateStatus(
    id,
    status
  ) {

    const {
      error,
    } = await supabase
      .from(
        "kitchen_ticket_items"
      )
      .update({
        status,
      })
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
          loadTickets
        )
        .subscribe();

    return () => {

      supabase.removeChannel(
        channel
      );
    };

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-8">

        <div>

          <div className="text-xs tracking-[0.3em] uppercase text-orange-400 mb-2">
            Kitchen
          </div>

          <div className="text-5xl font-semibold">
            Production
          </div>

        </div>

        <div className="px-5 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs tracking-[0.25em] uppercase flex items-center">
          {tickets.length} LIVE
        </div>

      </div>

      {tickets.length === 0 ? (

        <div className="h-[70vh] flex items-center justify-center text-zinc-600 text-2xl">
          No kitchen tickets
        </div>

      ) : (

        <div className="grid grid-cols-4 gap-6">

          {tickets.map((ticket) => (

            <div
              key={ticket.id}
              className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden"
            >

              <div className="p-6 border-b border-white/5">

                <div className="flex items-start justify-between mb-5">

                  <div>

                    <div className="text-3xl font-medium">
                      {ticket.item_name}
                    </div>

                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mt-2">
                      {ticket.station}
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-5xl font-light">
                      {ticket.quantity}
                    </div>

                    <div className="text-xs text-zinc-500 mt-2">
                      QTY
                    </div>

                  </div>

                </div>

                <div className={`h-11 rounded-2xl flex items-center justify-center text-xs tracking-[0.2em] uppercase ${
                  ticket.status === "READY"
                    ? "bg-emerald-500 text-black"
                    : ticket.status === "PREPARING"
                    ? "bg-orange-500 text-black"
                    : "bg-zinc-800 text-zinc-300"
                }`}>
                  {ticket.status}
                </div>

              </div>

              <div className="p-6">

                {ticket.status ===
                  "PENDING" && (

                  <button
                    onClick={() =>
                      updateStatus(
                        ticket.id,
                        "PREPARING"
                      )
                    }
                    className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 transition-all text-black font-medium"
                  >
                    START
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
                    className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-all text-black font-medium"
                  >
                    READY
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
                    className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-400 transition-all text-white font-medium"
                  >
                    SERVED
                  </button>
                )}

              </div>

            </div>
          ))}

        </div>

      )}

    </div>
  );
}
