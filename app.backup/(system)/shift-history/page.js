"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function ShiftHistoryPage() {

  const [shifts, setShifts] =
    useState([]);

  // =========================
  // LOAD SHIFTS
  // =========================

  useEffect(() => {

    loadShifts();

  }, []);

  const loadShifts =
    async () => {

      const {
        data,
        error,
      } = await supabase
        .from(
          "shift_closures"
        )
        .select("*")
        .eq(
          "tenant_id",
          TENANT_ID
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {

        console.error(
          error
        );

        return;

      }

      setShifts(
        data || []
      );

    };

  return (

    <div className="space-y-10 text-white p-6">

      <h1 className="text-3xl">
        Shift History
      </h1>

      <div className="space-y-6">

        {shifts.length === 0 && (

          <div className="text-white/40">
            No shift history
          </div>

        )}

        {shifts.map(
          (shift) => {

            const difference =
              Number(
                shift.cash_difference || 0
              );

            const differenceColor =
              difference === 0
                ? "text-green-400"
                : difference > 0
                ? "text-yellow-400"
                : "text-red-400";

            return (

              <div
                key={shift.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4"
              >

                {/* ========================= */}
                {/* HEADER */}
                {/* ========================= */}

                <div className="flex justify-between items-start">

                  <div>

                    <div className="text-xl">

                      {shift.cashier_name}

                    </div>

                    <div className="text-sm text-white/40">

                      {new Date(
                        shift.created_at
                      ).toLocaleString()}

                    </div>

                  </div>

                  <div
                    className={`text-xl font-semibold ${differenceColor}`}
                  >

                    THB{" "}
                    {difference.toLocaleString()}

                  </div>

                </div>

                {/* ========================= */}
                {/* FINANCIALS */}
                {/* ========================= */}

                <div className="grid md:grid-cols-3 gap-4">

                  <Metric
                    title="Expected Cash"
                    value={
                      shift.expected_cash
                    }
                  />

                  <Metric
                    title="Actual Cash"
                    value={
                      shift.actual_cash
                    }
                  />

                  <Metric
                    title="Total Revenue"
                    value={
                      shift.total_revenue
                    }
                  />

                  <Metric
                    title="Card Revenue"
                    value={
                      shift.card_total
                    }
                  />

                  <Metric
                    title="Transfer Revenue"
                    value={
                      shift.transfer_total
                    }
                  />

                  <Metric
                    title="Difference"
                    value={
                      shift.cash_difference
                    }
                    color={
                      differenceColor
                    }
                  />

                </div>

                {/* ========================= */}
                {/* NOTES */}
                {/* ========================= */}

                {shift.notes && (

                  <div className="bg-black/30 border border-white/10 rounded-xl p-4">

                    <div className="text-sm text-white/50 mb-2">

                      Shift Notes

                    </div>

                    <div className="whitespace-pre-wrap">

                      {shift.notes}

                    </div>

                  </div>

                )}

              </div>

            );

          }
        )}

      </div>

    </div>

  );

}

function Metric({
  title,
  value,
  color = "text-white",
}) {

  return (

    <div className="bg-black/20 border border-white/5 rounded-xl p-4">

      <div className="text-xs text-white/40">

        {title}

      </div>

      <div className={`text-lg mt-1 ${color}`}>

        THB{" "}
        {Number(value || 0).toLocaleString()}

      </div>

    </div>

  );

}
