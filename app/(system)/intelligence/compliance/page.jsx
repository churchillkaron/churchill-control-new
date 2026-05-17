"use client";

import { useEffect, useState } from "react";

export default function CompliancePage() {

  const [
    data,
    setData,
  ] = useState(null);

  async function load() {

    const res =
      await fetch(
        "/api/intelligence/compliance",
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

  const summary =
    data?.compliance_summary;

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            AI Compliance Governance
          </h1>

          <div className="text-zinc-500 mt-3">
            Enterprise Compliance & Risk Intelligence
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Compliance Score
            </div>

            <div className="text-5xl mt-4 text-green-400">
              {summary?.score || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Violations
            </div>

            <div className="text-5xl mt-4 text-red-400">
              {summary?.violations || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Audit Logs
            </div>

            <div className="text-5xl mt-4">
              {summary?.audit_logs || 0}
            </div>

          </div>

          <div className="border border-zinc-800 rounded-2xl p-6">

            <div className="text-zinc-500">
              Accounting Records
            </div>

            <div className="text-5xl mt-4">
              {
                summary?.accounting_records || 0
              }
            </div>

          </div>

        </div>

        <div className="space-y-6">

          {data?.violations?.map(
            (
              item,
              index
            ) => (

              <div
                key={index}
                className="border border-zinc-800 rounded-2xl p-6"
              >

                <div className="flex items-center justify-between mb-4">

                  <div className="text-2xl">
                    {item.type}
                  </div>

                  <div className="text-sm text-red-400">
                    {item.severity}
                  </div>

                </div>

                <div className="text-lg mb-4">
                  {item.recommendation}
                </div>

                <div className="text-zinc-500">
                  Incidents:
                  {" "}
                  {item.count}
                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
