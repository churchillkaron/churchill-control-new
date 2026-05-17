"use client";

import { useEffect, useState } from "react";

export default function PayrollAIPage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/payroll",
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
            Payroll Intelligence
          </h1>

          <div className="text-zinc-500 mt-2">
            AI Payroll & Staff Cost Analytics
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
            Total Payroll
          </div>

          <div className="text-5xl mt-4">
            {
              data?.payroll_summary
                ?.total_payroll || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Total Penalties
          </div>

          <div className="text-5xl mt-4">
            {
              data?.payroll_summary
                ?.total_penalties || 0
            }
          </div>

        </div>

        <div className="border border-zinc-800 rounded-2xl p-6">

          <div className="text-zinc-500">
            Total Staff
          </div>

          <div className="text-5xl mt-4">
            {
              data?.payroll_summary
                ?.total_staff || 0
            }
          </div>

        </div>

      </div>

      <div className="border border-zinc-800 rounded-2xl p-6 mb-10">

        <div className="text-2xl mb-6">
          Department Payroll Ranking
        </div>

        <div className="space-y-4">

          {data?.departments?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-xl p-4"
              >

                <div className="flex items-center justify-between">

                  <div>

                    #{index + 1}
                    {" "}
                    {item.department}

                  </div>

                  <div>

                    {item.total_payout}

                  </div>

                </div>

              </div>
            )
          )}

        </div>

      </div>

      <div className="space-y-6">

        {data?.payroll?.map(
          (
            staff,
            index
          ) => (

            <div
              key={index}
              className="border border-zinc-800 rounded-2xl p-6"
            >

              <div className="flex items-center justify-between">

                <div>

                  <div className="text-2xl">
                    {staff.staff_name}
                  </div>

                  <div className="text-zinc-500 mt-2">
                    {staff.department}
                  </div>

                </div>

                <div className="text-right">

                  <div>
                    Final:
                    {" "}
                    {staff.final_payout}
                  </div>

                  <div className="mt-2">
                    Salary:
                    {" "}
                    {staff.salary}
                  </div>

                  <div className="mt-2">
                    Service:
                    {" "}
                    {staff.service_charge}
                  </div>

                  <div className="mt-2">
                    Penalties:
                    {" "}
                    {staff.penalties}
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
