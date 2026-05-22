"use client";

export const dynamic = "force-dynamic";


import Link from "next/link";

import { useEffect, useState }
from "react";

import { supabase }
from "@/lib/shared/supabase/client";

import acknowledgePayrollRecord
from "@/lib/payroll/consolidation/acknowledgePayrollRecord";

import disputePayrollRecord
from "@/lib/payroll/consolidation/disputePayrollRecord";

export default function StaffEarningsPage() {

  const [
    payroll,
    setPayroll,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  useEffect(() => {

    loadPayroll();

  }, []);

  async function loadPayroll() {

    try {

      const {
        data,
        error,
      } = await supabase

        .from(
          "payroll_records"
        )

        .select("*")

        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {
        throw error;
      }

      setPayroll(
        data || []
      );

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  async function disputePayroll(
    payrollRecordId
  ) {

    try {

      const disputeReason =
        prompt(
          "Describe payroll issue"
        );

      if (
        !disputeReason
      ) return;

      await disputePayrollRecord({

        payrollRecordId,

        staffName:
          "STAFF",

        disputeReason,

      });

      alert(
        "Payroll dispute submitted"
      );

      await loadPayroll();

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }

  async function acknowledgePayroll(
    payrollRecordId
  ) {

    try {

      await acknowledgePayrollRecord({

        payrollRecordId,

        staffName:
          "STAFF",

      });

      alert(
        "Payroll acknowledged"
      );

      await loadPayroll();

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }

  async function openPayslip(
    payrollRecordId
  ) {

    const res =
      await fetch(
        "/api/payroll/payslip",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            payrollRecordId,

          }),

        }
      );

    const blob =
      await res.blob();

    const url =
      window.URL.createObjectURL(
        blob
      );

    window.open(
      url,
      "_blank"
    );

  }

  return (
    
      <div className="space-y-8 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl">Earnings</h1>
          <Link
            href="/staff"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Back to Staff Portal
          </Link>
        </div>

        <div className="space-y-4">

          {loading && (

            <div className="text-white/60">

              Loading payroll...

            </div>

          )}

          {payroll.map(
            row => (

              <div
                key={row.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >

                <div className="grid grid-cols-6 gap-4">

                  <div>

                    <div className="text-xs uppercase text-white/40">

                      Payroll Month

                    </div>

                    <div className="mt-2 text-lg">

                      {row.payroll_month}

                    </div>

                  </div>

                  <div>

                    <div className="text-xs uppercase text-white/40">

                      Final Salary

                    </div>

                    <div className="mt-2 text-lg text-emerald-400">

                      ฿{Number(
                        row.final_salary || 0
                      ).toLocaleString()}

                    </div>

                  </div>

                  <div>

                    <div className="text-xs uppercase text-white/40">

                      Status

                    </div>

                    <div className="mt-2 text-lg">

                      {row.status}

                    </div>

                  </div>

                  <div>

                    <div className="text-xs uppercase text-white/40">

                      Payout

                    </div>

                    <div className="mt-2 text-lg">

                      {row.payout_status || "PENDING"}

                    </div>

                  </div>

                  <div>

                    <div className="text-xs uppercase text-white/40">

                      Attendance

                    </div>

                    <div className="mt-2 text-lg">

                      {row.attendance_score || 0}%

                    </div>

                  </div>

                  <div className="flex items-center justify-end gap-2">

                    <button
                      onClick={() =>
                        openPayslip(
                          row.id
                        )
                      }
                      className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white"
                    >

                      PAYSLIP

                    </button>

                    {!row.employee_acknowledged && (

                      <>

                        <button
                          onClick={() =>
                            acknowledgePayroll(
                              row.id
                            )
                          }
                          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
                        >

                          ACKNOWLEDGE

                        </button>

                        <button
                          onClick={() =>
                            disputePayroll(
                              row.id
                            )
                          }
                          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                        >

                          DISPUTE

                        </button>

                      </>

                    )}

                    {row.employee_acknowledged && (

                      <div className="rounded-xl bg-white/10 px-4 py-2 text-xs text-emerald-400">

                        ACKNOWLEDGED

                      </div>

                    )}

                  </div>

                </div>

              </div>

            )
          )}

        </div>
      </div>
   
  );
}