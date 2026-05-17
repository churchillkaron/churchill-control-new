"use client";

import { useEffect, useState } from "react";

export default function StaffingAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/staffing",
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
            Predictive Staffing
          </h1>

          <div className="text-zinc-500 mt-2">
            AI Labor Forecasting & Staffing Intelligence
          </div>

        </div>

        <button
          onClick={load}
          className="bg-white text-black px-6 py-3 rounded-xl"
        >
          Refresh
        </button>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Staffing Level
          </div>

          <div className="text-4xl mt-4">
            {data?.staffing_level}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Projected Revenue
          </div>

          <div className="text-4xl mt-4">
            {data?.projected_revenue || 0}
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Total Staff
          </div>

          <div className="text-4xl mt-4">
            {data?.total_staff || 0}
          </div>

        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-2xl mb-4">
          AI Recommendation
        </div>

        <div className="text-lg">
          {data?.recommendation}
        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6">

        <div className="text-2xl mb-6">
          Department Staffing
        </div>

        <div className="space-y-4">

          {data?.departments?.map(
            (
              dept,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-xl p-4"
              >

                <div className="flex items-center justify-between">

                  <div>
                    {dept.department}
                  </div>

                  <div>
                    {dept.staff_count}
                    {" "}
                    Staff
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
