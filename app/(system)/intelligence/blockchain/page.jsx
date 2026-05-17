"use client";

import { useEffect, useState } from "react";

export default function BlockchainLedgerPage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function load() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/blockchain",
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

    } finally {

      setLoading(false);
    }
  }

  useEffect(() => {

    load();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Audit Blockchain Ledger
            </h1>

            <div className="text-zinc-500 mt-3">
              Immutable Enterprise Audit Intelligence
            </div>

          </div>

          <button
            onClick={load}
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Generating..."
              : "Generate Ledger"}
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Total Blocks
            </div>

            <div className="text-5xl mt-4">
              {
                data?.total_blocks || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6 overflow-auto">

            <div className="text-zinc-500">
              Latest Hash
            </div>

            <div className="text-sm mt-4 break-all">
              {
                data?.latest_hash || "-"
              }
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.blockchain?.map(
            (
              block,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-start justify-between mb-4">

                  <div>

                    <div className="text-2xl">
                      {block.action}
                    </div>

                    <div className="text-zinc-500 mt-2">
                      {block.table_name}
                    </div>

                  </div>

                  <div className="text-right text-sm">

                    <div>
                      {block.created_at}
                    </div>

                  </div>

                </div>

                <div className="space-y-4 text-xs overflow-auto">

                  <div>

                    <div className="text-zinc-500 mb-2">
                      Previous Hash
                    </div>

                    <div className="break-all">
                      {block.previous_hash}
                    </div>

                  </div>

                  <div>

                    <div className="text-zinc-500 mb-2">
                      Hash
                    </div>

                    <div className="break-all">
                      {block.hash}
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
