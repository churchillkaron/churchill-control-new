"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function InventoryLedgerPage() {

  const [
    entries,
    setEntries,
  ] = useState([]);

  async function loadLedger() {

    const {
      data,
    } = await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(200);

    setEntries(
      data || []
    );
  }

  useEffect(() => {

    loadLedger();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Inventory Ledger
        </h1>

        <div className="text-zinc-500 mb-10">
          Live Inventory Movement Engine
        </div>

        <div className="space-y-4">

          {entries.map(
            (
              entry
            ) => (

              <div
                key={entry.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        entry.ingredient_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        entry.movement_type
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-xl">
                      -
                      {
                        entry.quantity
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        entry.previous_quantity
                      }
                      {" → "}
                      {
                        entry.new_quantity
                      }
                    </div>

                  </div>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
