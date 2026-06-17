"use client";

import {
  useEffect,
  useState,
} from "react";

import { supabase }
from "@/lib/shared/supabase/client";

import createPayrollSnapshot
from "@/lib/payroll/snapshots/createPayrollSnapshot";

export default function AccountingShiftPage() {

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
        "APPROVED"
      )

      .eq(
        "accounting_status",
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

  async function finalizeShift(
    shift
  ) {

    await supabase

      .from("pos_shifts")

      .update({

        accounting_status:
          "FINALIZED",

        accounting_confirmed_by:
          "ACCOUNTING",

        accounting_confirmed_at:
          new Date().toISOString(),

        locked:
          true,

      })

      .eq(
        "id",
        shift.id
      );

    await createPayrollSnapshot({

      tenantId:
        shift.tenant_id,

      shiftId:
        shift.id,

      staffPerformance:
        shift.staff_performance || [],

    });

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

            Accounting Shift Finalization

          </div>

          <div className="mt-2 text-zinc-500">

            Enterprise Financial Close Workflow

          </div>

        </div>

        <div className="space-y-6">

          {shifts.map(
            shift => (

              <div
                key={shift.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8"
              >

                <div className="grid grid-cols-5 gap-6">

                  <Metric
                    label="Cash"
                    value={shift.cash_total}
                  />

                  <Metric
                    label="Card"
                    value={shift.card_total}
                  />

                  <Metric
                    label="QR"
                    value={shift.qr_total}
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
                    label="Net Sales"
                    value={shift.net_sales}
                  />

                </div>

                <div className="mt-8 flex justify-end">

                  <button
                    onClick={() =>
                      finalizeShift(
                        shift
                      )
                    }
                    className="rounded-2xl bg-emerald-500 px-8 py-4 font-semibold text-black"
                  >

                    FINALIZE SHIFT

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
