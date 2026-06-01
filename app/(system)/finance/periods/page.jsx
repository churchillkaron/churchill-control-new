"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  runtimeTheme as theme,
} from "@/lib/design/runtimeTheme";

import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

export default function AccountingPeriodsPage() {

  const {
    organization,
  } = useOrganizationRuntime();

  const [periods, setPeriods] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [closing, setClosing] =
    useState(null);

  useEffect(() => {

    load();

  }, []);

  async function load() {

    try {

      const res =
        await fetch(
          `/api/finance/periods?organizationId=${organization?.id}`
        );

      const json =
        await res.json();

      setPeriods(
        json.periods || []
      );

    } catch (error) {

      console.error(
        error
      );

    }

    setLoading(false);

  }

  async function closePeriod(id) {

    try {

      setClosing(id);

      const res =
        await fetch(

          "/api/finance/periods/close",

          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "application/json",

            },

            body:
              JSON.stringify({

                organizationId:
                  organization?.id,

                periodId: id,

              }),

          }

        );

      const json =
        await res.json();

      console.log(json);

      await load();

    } catch (error) {

      console.error(
        error
      );

    }

    setClosing(null);

  }

  if (loading) {

    return (

      <div className={theme.page}>

        <div className={theme.container}>

          <div className={theme.card}>
            Loading Accounting Periods...
          </div>

        </div>

      </div>

    );

  }

  return (

    <div className={theme.page}>

      <div className={theme.container}>

        <div className={`${theme.glassStrong} p-8 mb-10`}>

          <div className="flex items-center justify-between">

            <div>

              <div className="uppercase tracking-[0.3em] text-xs text-cyan-400 mb-3">

                Enterprise Governance Runtime

              </div>

              <h1 className="text-5xl font-black tracking-tight">

                Accounting Period Control

              </h1>

              <p className="text-zinc-400 mt-4 max-w-2xl leading-relaxed">

                Control financial close cycles,
                accounting locks and enterprise
                reporting governance.

              </p>

            </div>

            <div className="px-5 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm">

              PERIOD GOVERNANCE ACTIVE

            </div>

          </div>

        </div>

        <div className="space-y-6">

          {periods.map((period) => (

            <div
              key={period.id}
              className={`${theme.glassStrong} p-8`}
            >

              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">

                <div>

                  <div className="text-3xl font-bold mb-3">

                    {period.name}

                  </div>

                  <div className="text-zinc-400">

                    {period.start_date}
                    {" → "}
                    {period.end_date}

                  </div>

                </div>

                <div className="flex items-center gap-5">

                  <div className={`px-5 py-3 rounded-2xl border ${
                    period.status === "closed"
                      ? "border-red-500/20 bg-red-500/10 text-red-400"
                      : "border-green-500/20 bg-green-500/10 text-green-400"
                  }`}>

                    {period.status}

                  </div>

                  {period.status !== "closed" && (

                    <button
                      onClick={() =>
                        closePeriod(
                          period.id
                        )
                      }
                      disabled={
                        closing === period.id
                      }
                      className={theme.button}
                    >

                      {
                        closing === period.id
                          ? "Closing..."
                          : "Close Period"
                      }

                    </button>

                  )}

                </div>

              </div>

              {period.closed_at && (

                <div className="mt-6 text-zinc-500 text-sm">

                  Closed at:
                  {" "}
                  {period.closed_at}

                </div>

              )}

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}
