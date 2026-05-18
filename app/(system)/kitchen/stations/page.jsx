"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function KitchenStationsPage() {

  const [
    stations,
    setStations,
  ] = useState({});

  async function loadStations() {

    const {
      data,
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

    const grouped = {};

    for (const item of data || []) {

      if (
        !grouped[
          item.station
        ]
      ) {

        grouped[
          item.station
        ] = [];
      }

      grouped[
        item.station
      ].push(
        item
      );
    }

    setStations(
      grouped
    );
  }

  useEffect(() => {

    loadStations();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <h1 className="text-5xl font-bold mb-10">
        Kitchen Stations
      </h1>

      <div className="grid grid-cols-5 gap-6">

        {Object.entries(
          stations
        ).map(
          ([
            station,
            items,
          ]) => (

            <div
              key={station}
              className="border border-zinc-800 rounded-3xl p-5"
            >

              <div className="text-2xl font-bold mb-6">
                {station}
              </div>

              <div className="space-y-4">

                {items.map(
                  (
                    item
                  ) => (

                    <div
                      key={item.id}
                      className="bg-zinc-900 rounded-2xl p-4"
                    >

                      <div className="font-bold">
                        {
                          item.item_name
                        }
                      </div>

                      <div className="text-zinc-400">
                        Qty: {
                          item.quantity
                        }
                      </div>

                      <div className="text-xs text-zinc-500 mt-2">
                        {
                          item.status
                        }
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
  );
}
