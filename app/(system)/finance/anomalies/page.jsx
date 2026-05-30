"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

export default function FinanceAnomaliesPage() {

  const [anomalies, setAnomalies] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    try {

      const res =
        await fetch(
          "/api/finance/anomalies"
        );

      const json =
        await res.json();

      setAnomalies(
        json.anomalies || []
      );

    } catch (error) {

      console.error(
        error
      );

    }

    setLoading(false);

  }

  if (loading) {

    return (

      <div className={theme.page}>

        <div className={theme.container}>

          <div className={theme.card}>
            Loading Financial Intelligence...
          </div>

        </div>

      </div>

    );

  }

  return (

    <div className={theme.page}>

      <div className={theme.container}>

        <div className="mb-10">

          <div className="uppercase tracking-[0.3em] text-xs text-red-400 mb-4">

            AI Financial Intelligence

          </div>

          <h1 className={theme.title}>
            Accounting Anomalies
          </h1>

          <p className={`${theme.subtitle} mt-3`}>

            Enterprise financial monitoring,
            integrity analysis and anomaly
            detection runtime.

          </p>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

          <StatCard
            title="Total Alerts"
            value={
              anomalies.length
            }
            color="text-red-400"
          />

          <StatCard
            title="Critical"
            value={
              anomalies.filter(
                (a) =>
                  a.severity ===
                  "critical"
              ).length
            }
            color="text-orange-400"
          />

          <StatCard
            title="Warnings"
            value={
              anomalies.filter(
                (a) =>
                  a.severity ===
                  "warning"
              ).length
            }
            color="text-yellow-400"
          />

        </div>

        <div className="space-y-6">

          {anomalies.length === 0 && (

            <div className={`${theme.glassStrong} p-10 text-center`}>

              <div className="text-5xl mb-4">

                ✓

              </div>

              <div className="text-2xl font-semibold text-green-400">

                No Financial Anomalies Detected

              </div>

              <div className="text-zinc-500 mt-3">

                Accounting runtime integrity stable.

              </div>

            </div>

          )}

          {anomalies.map((anomaly, index) => (

            <div
              key={index}
              className={`${theme.glassStrong} p-8 border ${
                anomaly.severity === "critical"
                  ? "border-red-500/20"
                  : "border-yellow-500/20"
              }`}
            >

              <div className="flex items-start justify-between mb-6">

                <div>

                  <div className={`inline-flex px-4 py-2 rounded-2xl text-xs uppercase tracking-[0.2em] border mb-4 ${
                    anomaly.severity === "critical"
                      ? "border-red-500/20 bg-red-500/10 text-red-400"
                      : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                  }`}>

                    {anomaly.severity}

                  </div>

                  <h2 className="text-2xl font-semibold">

                    {anomaly.type}

                  </h2>

                  <div className="text-zinc-400 mt-3">

                    {anomaly.message}

                  </div>

                </div>

                <div className="text-right">

                  <div className="text-zinc-500 text-sm">

                    {anomaly.entry_number}

                  </div>

                </div>

              </div>

              <div className={theme.card}>

                <div className="text-zinc-500 text-sm mb-2">

                  Description

                </div>

                <div className="text-lg">

                  {anomaly.description}

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}

function StatCard({
  title,
  value,
  color,
}) {

  return (

    <div className={`${theme.card} ${theme.cardHover}`}>

      <div className="text-zinc-500 text-sm mb-3 uppercase tracking-[0.2em]">

        {title}

      </div>

      <div className={`text-5xl font-bold ${color}`}>

        {
          Number(
            value || 0
          ).toLocaleString()
        }

      </div>

    </div>

  );

}
