"use client";

import { useEffect, useState } from "react";

export default function ProcurementAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/procurement/suppliers",
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
            Procurement Intelligence
          </h1>

          <div className="text-zinc-500 mt-2">
            Supplier Analytics & Spend Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-zinc-500">
          Total Suppliers
        </div>

        <div className="text-5xl mt-4">
          {data?.total_suppliers || 0}
        </div>

      </div>

      <div className="space-y-6">

        {data?.suppliers?.map(
          (
            supplier,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-2xl">
                    {supplier.supplier}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    Orders:
                    {" "}
                    {supplier.total_orders}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Spend:
                    {" "}
                    {supplier.total_spend}
                  </div>

                  <div className="mt-2">
                    Approved:
                    {" "}
                    {supplier.approved_orders}
                  </div>

                  <div className="mt-2">
                    Pending:
                    {" "}
                    {supplier.pending_orders}
                  </div>

                </div>

              </div>

            </div>
          )
        )}

      </div>

    </div>
  );
}
