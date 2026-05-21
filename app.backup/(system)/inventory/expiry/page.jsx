"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function ExpiryPage() {

  const [
    items,
    setItems,
  ] = useState([]);

  async function loadInventory() {

    const {
      data,
    } = await supabase
      .from(
        "prepared_inventory"
      )
      .select("*")
      .order(
        "expiry_date",
        {
          ascending: true,
        }
      );

    setItems(
      data || []
    );
  }

  useEffect(() => {

    loadInventory();

  }, []);

  function getStatus(
    expiryDate
  ) {

    if (!expiryDate)
      return "NO_EXPIRY";

    const now =
      new Date();

    const expiry =
      new Date(
        expiryDate
      );

    if (
      expiry < now
    ) {

      return "EXPIRED";
    }

    const diffDays =
      (
        expiry - now
      ) /
      (
        1000 *
        60 *
        60 *
        24
      );

    if (
      diffDays <= 1
    ) {

      return "URGENT";
    }

    if (
      diffDays <= 3
    ) {

      return "WARNING";
    }

    return "GOOD";
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Expiry Tracking
        </h1>

        <div className="text-zinc-500 mb-10">
          Shelf Life & Spoilage Intelligence
        </div>

        <div className="space-y-4">

          {items.map(
            (
              item
            ) => {

              const status =
                getStatus(
                  item.expiry_date
                );

              return (

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
                        Expires:
                        {" "}
                        {
                          item.expiry_date
                            ? new Date(
                                item.expiry_date
                              ).toLocaleString()
                            : "N/A"
                        }
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-2xl">
                        {
                          item.quantity
                        }
                      </div>

                      <div className="mt-2">
                        {
                          status
                        }
                      </div>

                    </div>

                  </div>

                </div>
              );
            }
          )}

        </div>

      </div>

    </div>
  );
}
