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
    } = await supabase
      .from("kitchen_tickets")
      .select(`
        id,
        table_number,
        status,
        created_at,
        kitchen_ticket_items (
          id,
          item_name,
          quantity,
          station,
          status
        )
      `)
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    setTickets(
      data || []
    );
  }

  async function updateStatus(
    item_id,
    status
  ) {

    await fetch(
      "/api/production/kitchen",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          action:
            "UPDATE_ITEM_STATUS",

          item_id,

          status,
        }),
      }
    );

    loadTickets();
  }

  useEffect(() => {

    loadTickets();

    const interval =
      setInterval(
        loadTickets,
        3000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Kitchen Production
        </h1>

        <div className="text-zinc-500 mb-10">
          Live Production Workflow Engine
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {tickets.map(
            (
              ticket
            ) => (

              <div
                key={ticket.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between mb-6">

                  <div>

                    <div className="text-3xl font-bold">
                      {
                        ticket.table_number
                      }
                    </div>

                    <div className="text-zinc-500 mt-1">
                      {
                        ticket.status
                      }
                    </div>

                  </div>

                </div>

                <div className="space-y-4">

                  {ticket.kitchen_ticket_items?.map(
                    (
                      item
                    ) => (

                      <div
                        key={
                          item.id
                        }
                        className="border border-zinc-800 rounded-2xl p-4"
                      >

                        <div className="flex justify-between mb-3">

                          <div>
                            {
                              item.item_name
                            }
                          </div>

                          <div>
                            x
                            {
                              item.quantity
                            }
                          </div>

                        </div>

                        <div className="text-zinc-500 text-sm mb-4">
                          {
                            item.station
                          }
                        </div>

                        <div className="grid grid-cols-3 gap-2">

                          <button
                            onClick={() =>
                              updateStatus(
                                item.id,
                                "FIRED"
                              )
                            }
                            className="border border-yellow-500 rounded-xl py-2 text-xs"
                          >
                            FIRE
                          </button>

                          <button
                            onClick={() =>
                              updateStatus(
                                item.id,
                                "READY"
                              )
                            }
                            className="border border-green-500 rounded-xl py-2 text-xs"
                          >
                            READY
                          </button>

                          <button
                            onClick={() =>
                              updateStatus(
                                item.id,
                                "SERVED"
                              )
                            }
                            className="border border-blue-500 rounded-xl py-2 text-xs"
                          >
                            SERVED
                          </button>

                        </div>

                      </div>
                    )
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
