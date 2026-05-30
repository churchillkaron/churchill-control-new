"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function AccountingAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/accounting",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            tenant_id:
              "demo",
          }),
        }
      );

    const json =
      await res.json();

    setData(json);
  }

  useEffect(() => {

    load();

  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-10">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-5xl font-bold">
            Accounting Intelligence
          </h1>

          <div className="text-zinc-500 mt-2">
            AI Financial Ledger Analysis
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Entries
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_entries || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Debit
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_debit || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Credit
          </div>

          <div className="text-4xl mt-4">
            {
              data?.summary
                ?.total_credit || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Status
          </div>

          <div className="text-3xl mt-4">
            {
              data?.summary
                ?.accounting_status
            }
          </div>

        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6">

        <div className="text-2xl mb-6">
          Recent Journal Entries
        </div>

        <div className="space-y-4">

          {data?.recent_entries?.map(
            (
              entry,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-xl p-4"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div>
                      {entry.description}
                    </div>

                    <div className="text-zinc-500 text-sm mt-2">
                      {entry.created_at}
                    </div>

                  </div>

                  <div className="text-right">

                    <div>
                      Debit:
                      {" "}
                      {entry.debit}
                    </div>

                    <div className="mt-2">
                      Credit:
                      {" "}
                      {entry.credit}
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
