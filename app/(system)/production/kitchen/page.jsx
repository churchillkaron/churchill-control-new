"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionKitchenPage() {

  const [
    tickets,
    setTickets,
  ] = useState([]);

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
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (!error) {

      setTickets(
        data || []
      );
    }
  }

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

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-5xl font-bold mb-10">
          Production Kitchen
        </h1>

        <div className="grid grid-cols-4 gap-6">

          {tickets.map(
            (
              ticket
            ) => (

              <div
                key={ticket.id}
                className="border border-zinc-800 rounded-3xl p-5"
              >

                <div className="text-2xl font-bold mb-3">
                  {
                    ticket.item_name
                  }
                </div>

                <div className="text-zinc-400 mb-3">
                  Qty:
                  {" "}
                  {
                    ticket.quantity
                  }
                </div>

                <div className="text-zinc-500 mb-3">
                  {
                    ticket.station
                  }
                </div>

                <div className="text-xl font-bold mb-6">
                  {
                    ticket.status
                  }
                </div>

                <div className="flex flex-col gap-3">

                  {ticket.status ===
                    "PENDING" && (

                    <button
                      onClick={() =>
                        updateStatus(
                          ticket.id,
                          "PREPARING"
                        )
                      }
                      className="bg-yellow-500 text-black rounded-xl py-3 font-bold"
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
                      className="bg-green-500 text-black rounded-xl py-3 font-bold"
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
                      className="bg-blue-500 text-black rounded-xl py-3 font-bold"
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

    </div>
  );
}
