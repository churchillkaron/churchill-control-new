"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function PreparedInventoryPage() {

  const [
    items,
    setItems,
  ] = useState([]);

  async function loadPreparedInventory() {

    const {
      data,
    } = await supabase
      .from(
        "prepared_inventory"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    setItems(
      data || []
    );
  }

  async function consumeItem(
    item
  ) {

    await fetch(
      "/api/production/prepared",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          tenant_id:
            item.tenant_id,

          prepared_item_name:
            item.item_name,

          quantity: 1,

          reference_id:
            item.id,
        }),
      }
    );

    loadPreparedInventory();
  }

  useEffect(() => {

    loadPreparedInventory();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Prepared Inventory
        </h1>

        <div className="text-zinc-500 mb-10">
          Semi-Finished Production Inventory
        </div>

        <div className="space-y-4">

          {items.map(
            (
              item
            ) => (

              <div
                key={item.id}
                className="border border-zinc-800 rounded-3xl p-6"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-2xl font-bold">
                      {
                        item.item_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      Batch:
                      {" "}
                      {
                        item.batch_id
                      }
                    </div>

                  </div>

                  <div className="flex items-center gap-6">

                    <div className="text-right">

                      <div className="text-2xl">
                        {
                          item.quantity
                        }
                      </div>

                      <div className="text-zinc-500 mt-2">
                        {
                          item.unit
                        }
                      </div>

                    </div>

                    <button
                      onClick={() =>
                        consumeItem(
                          item
                        )
                      }
                      className="bg-white text-black rounded-2xl px-6 py-3 font-bold"
                    >
                      CONSUME
                    </button>

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
