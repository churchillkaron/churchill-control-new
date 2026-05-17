"use client";

import { useEffect, useState } from "react";

export default function RetentionAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/retention",
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

          <h1 className="text-6xl font-bold">
            Retention AI
          </h1>

          <div className="text-zinc-500 mt-3">
            Customer Retention & Win-Back Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-8 py-4 rounded-2xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Customers
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.total_customers || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            High Risk
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.high_risk || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            VIP Risk
          </div>

          <div className="text-5xl mt-4">
            {
              data?.summary
                ?.vip_risk || 0
            }
          </div>

        </div>

      </div>

      <div className="space-y-6">

        {data?.customers?.map(
          (
            customer,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-start justify-between">

                <div>

                  <div className="text-2xl">
                    {customer.customer}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    {customer.phone}
                  </div>

                  <div className="mt-4">
                    {customer.action}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Risk:
                    {" "}
                    {customer.retention_risk}
                  </div>

                  <div className="mt-2">
                    Revenue:
                    {" "}
                    {customer.revenue}
                  </div>

                  <div className="mt-2">
                    Visits:
                    {" "}
                    {customer.visits}
                  </div>

                  <div className="mt-2">
                    Days Away:
                    {" "}
                    {customer.days_since_visit}
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
