"use client";

import { useEffect, useState } from "react";

export default function AccountingClosePage() {

  const [
    data,
    setData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function runClose() {

    setLoading(true);

    try {

      const res =
        await fetch(
          "/api/intelligence/finance/close",
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

    runClose();

  }, []);

  const close =
    data?.accounting_close;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold">
              Autonomous Accounting Close
            </h1>

            <div className="text-zinc-500 mt-3">
              AI Financial Closing & Ledger Validation Engine
            </div>

          </div>

          <button
            onClick={runClose}
            disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-2xl disabled:opacity-50"
          >
            {loading
              ? "Running..."
              : "Run Close"}
          </button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Debit
            </div>

            <div className="text-4xl mt-4">
              {
                close?.total_debit || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Credit
            </div>

            <div className="text-4xl mt-4">
              {
                close?.total_credit || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Payments
            </div>

            <div className="text-4xl mt-4">
              {
                close?.total_payments || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Outstanding
            </div>

            <div className="text-4xl mt-4 text-red-400">
              {
                close?.outstanding_invoices || 0
              }
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Close Status
            </div>

            <div className="text-2xl mt-4 text-green-400">
              {
                close?.close_status || "-"
              }
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
