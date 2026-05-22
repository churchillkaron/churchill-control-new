"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase }
from "@/lib/shared/supabase/client";

export default function ShiftApprovalsPage() {

  const [
    shifts,
    setShifts,
  ] = useState([]);

  async function loadShifts() {

    const {
      data,
    } = await supabase

      .from("pos_shifts")

      .select("*")

      .eq(
        "approval_status",
        "PENDING"
      )

      .order(
        "closed_at",
        {
          ascending: false,
        }
      );

    setShifts(
      data || []
    );

  }

  async function approveShift(
    shift
  ) {

    await supabase

      .from("pos_shifts")

      .update({

        approval_status:
          "APPROVED",

        approved_by:
          "MANAGER",

        approved_at:
          new Date().toISOString(),

        locked:
          true,

      })

      .eq(
        "id",
        shift.id
      );

    await loadShifts();

  }

  async function rejectShift(
    shift
  ) {

    const notes =
      prompt(
        "Reconciliation notes"
      );

    await supabase

      .from("pos_shifts")

      .update({

        approval_status:
          "REJECTED",

        reconciliation_notes:
          notes,

        locked:
          false,

      })

      .eq(
        "id",
        shift.id
      );

    await loadShifts();

  }

  useEffect(() => {

    loadShifts();

  }, []);

  return (

    <div className="min-h-screen bg-black p-10 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="mb-10">

          <div className="text-6xl font-bold">

            Shift Reconciliation

          </div>

          <div className="mt-2 text-zinc-500">

            Enterprise Cash Control & Approval

          </div>

        </div>

        <div className="space-y-6">

          {shifts.map(
            shift => (

              <div
                key={shift.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8"
              >

                <div className="grid grid-cols-4 gap-6">

                  <Metric
                    label="Opening Cash"
                    value={shift.opening_cash}
                  />

                  <Metric
                    label="Expected Cash"
                    value={shift.expected_cash}
                  />

                  <Metric
                    label="Counted Cash"
                    value={shift.closing_cash}
                  />

                  <Metric
                    label="Variance"
                    value={shift.variance}
                    danger={
                      Number(
                        shift.variance || 0
                      ) !== 0
                    }
                  />

                  <Metric
                    label="Cash Sales"
                    value={shift.cash_total}
                  />

                  <Metric
                    label="Card Sales"
                    value={shift.card_total}
                  />

                  <Metric
                    label="QR Sales"
                    value={shift.qr_total}
                  />

                  <Metric
                    label="Net Sales"
                    value={shift.net_sales}
                  />

                </div>

                <div className="mt-8 flex justify-end gap-4">

                  <button
                    onClick={() =>
                      rejectShift(
                        shift
                      )
                    }
                    className="rounded-2xl bg-red-500 px-6 py-3 font-semibold text-white"
                  >

                    REJECT

                  </button>

                  <button
                    onClick={() =>
                      approveShift(
                        shift
                      )
                    }
                    className="rounded-2xl bg-emerald-500 px-6 py-3 font-semibold text-black"
                  >

                    APPROVE & LOCK

                  </button>

                </div>

              </div>

            )
          )}

        </div>

      </div>

    </div>

  );

}

function Metric({
  label,
  value,
  danger = false,
}) {

  return (

    <div className="rounded-2xl border border-zinc-800 bg-black/30 p-5">

      <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">

        {label}

      </div>

      <div
        className={`mt-3 text-3xl font-bold ${
          danger
            ? "text-red-400"
            : "text-white"
        }`}
      >

        ฿{
          Number(
            value || 0
          ).toLocaleString()
        }

      </div>

    </div>

  );

}
