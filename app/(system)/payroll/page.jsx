"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

import { calculatePayroll } from "@/lib/payroll/calculatePayroll";
import { generatePayrollRecords } from "@/lib/payroll/generatePayrollRecords";

export default function PayrollPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    payroll,
    setPayroll,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    generating,
    setGenerating,
  ] = useState(false);

  // ===== BASE SALARIES =====
  const roleSalary = {
    OWNER: 80000,
    MANAGER: 50000,
    CHEF: 35000,
    CASHIER: 22000,
    WAITER: 18000,
    STAFF: 15000,
  };

  // ===== LOAD =====
  async function loadPayroll() {

    if (!tenantId) {
      return;
    }

    // ===== STAFF =====
    const {
      data: staffData,
    } = await supabase
      .from(
        "staff_accounts"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      );

    // ===== SHIFTS =====
    const {
      data: shiftData,
    } = await supabase
      .from("shift_logs")
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .eq(
        "status",
        "CLOCKED_OUT"
      );

    const finalStaff =
      staffData || [];

    const finalShifts =
      shiftData || [];

    // ===== BUILD PAYROLL =====
    const payrollData =
      finalStaff.map(
        (member) => {

          const staffShifts =
            finalShifts.filter(
              (shift) =>
                shift.staff_id ===
                member.id
            );

          const totalHours =
            staffShifts.reduce(
              (
                sum,
                shift
              ) =>
                sum +
                Number(
                  shift.total_hours || 0
                ),
              0
            );

          const overtimeHours =
            staffShifts.reduce(
              (
                sum,
                shift
              ) =>
                sum +
                Number(
                  shift.overtime_hours || 0
                ),
              0
            );

          const avgAttendance =
            staffShifts.length > 0
              ? (
                  staffShifts.reduce(
                    (
                      sum,
                      shift
                    ) =>
                      sum +
                      Number(
                        shift.attendance_score || 0
                      ),
                    0
                  ) /
                  staffShifts.length
                ).toFixed(2)
              : 100;

          const baseSalary =
            roleSalary[
              member.role
            ] || 15000;

          const serviceChargeBonus =
            totalHours > 160
              ? 3000
              : totalHours > 120
              ? 1500
              : 0;

          const calculation =
            calculatePayroll({

              baseSalary,

              totalHours,

              overtimeHours,

              attendanceScore:
                avgAttendance,

              serviceChargeBonus,
            });

          return {

            id: member.id,

            name:
              member.name,

            role:
              member.role,

            ...calculation,
          };
        }
      );

    setPayroll(
      payrollData
    );

    setLoading(false);
  }

  // ===== GENERATE =====
  async function handleGeneratePayroll() {

    try {

      setGenerating(true);

      await generatePayrollRecords({

        tenantId,

        payrollData:
          payroll,

        approvedBy:
          currentUser?.id,
      });

      alert(
        "Payroll generated successfully"
      );

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to generate payroll"
      );

    } finally {

      setGenerating(false);
    }
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      setCurrentUser(user);

      const {
        data,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select(
          "tenant_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        !data?.tenant_id
      ) {
        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    init();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadPayroll();

  }, [tenantId]);

  // ===== TOTAL =====
  const totalPayroll =
    payroll.reduce(
      (
        sum,
        employee
      ) =>
        sum +
        Number(
          employee.finalSalary || 0
        ),
      0
    );

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Payroll"
        subtitle="Operational payroll engine"
      >

        {loading ? (

          <div className="text-white/40">
            Loading payroll...
          </div>

        ) : (

          <div className="space-y-6">

            {/* ACTION */}
            <div className="flex justify-end">

              <button
                onClick={
                  handleGeneratePayroll
                }
                disabled={
                  generating
                }
                className="rounded-[18px] bg-[#8B5CF6] px-8 py-4 text-white transition hover:bg-[#9D6BFF] disabled:opacity-40"
              >
                {generating
                  ? "GENERATING..."
                  : "GENERATE PAYROLL"}
              </button>

            </div>

            {/* TOP */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-[#C4B5FD]/60">
                  TOTAL PAYROLL
                </div>

                <div
                  className="mt-4 text-5xl text-[#B58AF8]"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  ฿
                  {
                    Math.round(
                      totalPayroll
                    )
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  ACTIVE STAFF
                </div>

                <div
                  className="mt-4 text-5xl text-green-400"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    payroll.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-blue-300/60">
                  SYSTEM
                </div>

                <div
                  className="mt-5 text-xl text-blue-400"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  PAYROLL ACTIVE
                </div>

              </div>

            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-8 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  STAFF
                </div>

                <div>
                  ROLE
                </div>

                <div>
                  HOURS
                </div>

                <div>
                  OVERTIME
                </div>

                <div>
                  SCORE
                </div>

                <div>
                  BONUS
                </div>

                <div>
                  DEDUCTIONS
                </div>

                <div>
                  FINAL
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {payroll.map(
                  (employee) => (

                    <div
                      key={employee.id}
                      className="grid grid-cols-8 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 300,
                        }}
                      >
                        {
                          employee.name
                        }
                      </div>

                      <div className="text-white/50">
                        {
                          employee.role
                        }
                      </div>

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        {
                          employee.totalHours
                        }
                      </div>

                      <div className="text-blue-400">
                        {
                          employee.overtimeHours
                        }h
                      </div>

                      <div
                        className={`text-lg ${
                          Number(
                            employee.attendanceScore
                          ) >= 90
                            ? "text-green-400"
                            : Number(
                                employee.attendanceScore
                              ) >= 70
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        {
                          employee.attendanceScore
                        }
                      </div>

                      <div className="text-green-400">
                        ฿
                        {
                          employee.serviceChargeBonus
                        }
                      </div>

                      <div className="text-red-400">
                        ฿
                        {
                          employee.deductions
                        }
                      </div>

                      <div
                        className="text-xl"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        ฿
                        {
                          Math.round(
                            employee.finalSalary
                          )
                        }
                      </div>

                    </div>
                  )
                )}

              </div>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
