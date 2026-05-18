"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function GeneralLedgerPage() {

  const [
    entries,
    setEntries,
  ] = useState([]);

  async function loadEntries() {

    const {
      data,
    } = await supabase
      .from("general_ledger")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    setEntries(
      data || []
    );
  }

  useEffect(() => {

    loadEntries();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          General Ledger
        </h1>

        <div className="text-zinc-500 mb-10">
          Enterprise Financial Ledger
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
                        entry.account_name
                      }
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        entry.entry_type
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-3xl font-bold">

                      ฿
                      {
                        entry.amount
                      }

                    </div>

                    <div className="text-zinc-500 mt-2">
                      {
                        entry.reference_type
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
