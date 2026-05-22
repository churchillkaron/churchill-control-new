"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from "react";

import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Archive,
  BadgeCheck,
} from "lucide-react";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import {
  getAllowedPayrollActions,
} from "@/lib/payroll/consolidation/payrollActions";

import {
  executePayrollAction,
} from "@/lib/payroll/consolidation/executePayrollAction";

export default function PayrollGovernancePage() {

  const governanceRole =
    "OWNER";

  const [
    payroll,
    setPayroll,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  async function executeAction({

    action,
    payrollRecordId,

  }) {

    try {

      await executePayrollAction({

        action,

        payrollRecordId,

        role:
          governanceRole,

        actor:
          "OWNER",

      });

      await loadPayroll();

    } catch (err) {

      console.error(err);

      alert(
        err.message
      );

    }

  }

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

  useEffect(() => {

    loadPayroll();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white">

      {/* HEADER */}
      <div className="border-b border-white/5 px-10 py-8 flex items-center justify-between">

        <div>

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-400 mb-3">
            PAYROLL GOVERNANCE
          </div>

          <div className="text-5xl font-semibold">
            Payroll Lifecycle Runtime
          </div>

        </div>

        <div className="flex items-center gap-3 text-sm text-white/40">

          <ShieldCheck className="w-5 h-5 text-cyan-400" />

          Enterprise Governance Active

        </div>

      </div>

      {/* CONTENT */}
      <div className="p-8">

        {loading ? (

          <div className="text-white/40">
            Loading payroll governance...
          </div>

        ) : (

          <div className="space-y-5">

            {payroll.map(
              record => (

                <div
                  key={record.id}
                  className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6"
                >

                  <div className="flex items-start justify-between">

                    <div>

                      <div className="text-3xl font-medium">
                        {record.staff_name}
                      </div>

                      <div className="text-white/40 mt-2">
                        {record.role}
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-xs uppercase tracking-[0.25em] text-white/40 mb-2">
                        Payroll Month
                      </div>

                      <div className="text-xl">
                        {record.payroll_month}
                      </div>

                    </div>

                  </div>

                  <div className="flex items-center gap-3 mt-6 flex-wrap">

                    {getAllowedPayrollActions({

                      currentStatus:
                        record.status,

                      role:
                        governanceRole,

                    }).map(action => (

                      <button
                        key={action.key}
                        onClick={() =>
                          executeAction({

                            action:
                              action.key,

                            payrollRecordId:
                              record.id,

                          })
                        }
                        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-white/10 transition"
                      >

                        {action.label}

                      </button>

                    ))}

                  </div>

                  <div className="grid grid-cols-5 gap-5 mt-8">

                    <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-5">

                      <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                        Final Salary
                      </div>

                      <div className="text-3xl text-emerald-400 font-light">
                        ฿{Number(
                          record.final_salary || 0
                        ).toLocaleString()}
                      </div>

                    </div>

                    <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-5">

                      <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                        Status
                      </div>

                      <div className="text-lg">
                        {record.status}
                      </div>

                    </div>

                    <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-5">

                      <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                        Payout
                      </div>

                      <div className="text-lg">
                        {record.payout_status || "PENDING"}
                      </div>

                    </div>

                    <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-5">

                      <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                        Attendance
                      </div>

                      <div className="text-lg">
                        {record.attendance_score || 0}%
                      </div>

                    </div>

                    <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-5">

                      <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                        Governance
                      </div>

                      <div className="flex items-center gap-2">

                        {record.status === PAYROLL_STATUS.LOCKED && (

                          <Lock className="w-5 h-5 text-orange-400" />

                        )}

                        {record.status === PAYROLL_STATUS.CERTIFIED && (

                          <BadgeCheck className="w-5 h-5 text-cyan-400" />

                        )}

                        {record.status === PAYROLL_STATUS.ARCHIVED && (

                          <Archive className="w-5 h-5 text-violet-400" />

                        )}

                        {record.status === PAYROLL_STATUS.DISPUTED && (

                          <AlertTriangle className="w-5 h-5 text-red-400" />

                        )}

                        {record.status === PAYROLL_STATUS.FINALIZED && (

                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />

                        )}

                      </div>

                    </div>

                  </div>

                </div>

              )
            )}

          </div>

        )}

      </div>

    </div>

  );

}
