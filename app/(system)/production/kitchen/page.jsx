"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ProductionKitchenPage() {

  const [
    tickets,
    setTickets,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function loadTickets() {

    const {
      data,
      error,
    } = await supabase
      .from(
        "kitchen_ticket_items"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    console.log(
      "LOAD",
      data,
      error
    );

    if (!error) {

      setTickets(
        data || []
      );
    }

    setLoading(
      false
    );
  }

  async function updateStatus(
    id,
    status
  ) {

    console.log(
      "UPDATING",
      id,
      status
    );

    const {
      data,
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
      )
      .select();

    console.log(
      "UPDATE RESULT",
      data,
      error
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
          (payload) => {

            console.log(
              "REALTIME",
              payload
            );

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

  if (loading) {

    return (

      <div className="min-h-screen bg-black text-white flex items-center justify-center">

        Loading Kitchen...

      </div>
    );
  }

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
                  Station:
                  {" "}
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

                  <button
                    onClick={() =>
                      updateStatus(
                        ticket.id,
                        "PREPARING"
                      )
                    }
                    className="bg-yellow-500 text-black rounded-xl py-3 font-bold"
                  >
                    PREPARING
                  </button>

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

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
