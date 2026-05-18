"use client";

import { useState } from "react";

export default function FinanceReportsPage() {

  const [
    reports,
    setReports,
  ] = useState(null);

  async function generateReports() {

    const res =
      await fetch(
        "/api/finance/reports",
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

    setReports(
      json
    );
  }

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-10">

          <div>

            <h1 className="text-6xl font-bold mb-3">
              Financial Reports
            </h1>

            <div className="text-zinc-500">
              Enterprise Financial Statements
            </div>

          </div>

          <button
            onClick={
              generateReports
            }
            className="bg-white text-black rounded-2xl px-8 py-4 font-bold"
          >
            GENERATE
          </button>

        </div>

        {reports && (

          <div className="space-y-6">

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Profit & Loss
              </div>

              <pre className="text-sm overflow-auto">
                {JSON.stringify(
                  reports.profitLoss,
                  null,
                  2
                )}
              </pre>

            </div>

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Balance Sheet
              </div>

              <pre className="text-sm overflow-auto">
                {JSON.stringify(
                  reports.balanceSheet,
                  null,
                  2
                )}
              </pre>

            </div>

            <div className="border border-zinc-800 rounded-3xl p-6">

              <div className="text-2xl font-bold mb-4">
                Trial Balance
              </div>

              <pre className="text-sm overflow-auto">
                {JSON.stringify(
                  reports.trialBalance,
                  null,
                  2
                )}
              </pre>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
