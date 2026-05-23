import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function generateMonthlyPayroll({

  tenantId,

  payrollMonth,

}) {

  // =========================
  // LOAD STAFF ATTENDANCE
  // =========================

  const {
    data: attendance,
    error: attendanceError,
  } = await supabaseAdmin

    .from(
      "staff_attendance"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    );

  if (attendanceError) {
    throw attendanceError;
  }

  // =========================
  // LOAD STAFF SHIFTS
  // =========================

  const {
    data: shifts,
    error: shiftsError,
  } = await supabaseAdmin

    .from(
      "staff_shifts"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    );

  if (shiftsError) {
    throw shiftsError;
  }

  // =========================
  // LOAD PAYROLL SNAPSHOTS
  // =========================

  const {
    data: snapshots,
    error: snapshotError,
  } = await supabaseAdmin

    .from(
      "payroll_snapshots"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    );

  if (snapshotError) {
    throw snapshotError;
  }

  // =========================
  // GROUP STAFF
  // =========================

  const staffMap = {};

  for (
    const shift of
    shifts || []
  ) {

    if (
      !staffMap[
        shift.staff_name
      ]
    ) {

      staffMap[
        shift.staff_name
      ] = {

        staff_id:
          shift.id,

        staff_name:
          shift.staff_name,

        role:
          shift.staff_role,

        shifts: [],

        attendance: [],

        snapshots: [],

      };

    }

    staffMap[
      shift.staff_name
    ].shifts.push(
      shift
    );

  }

  for (
    const row of
    attendance || []
  ) {

    if (
      staffMap[
        row.staff_name
      ]
    ) {

      staffMap[
        row.staff_name
      ].attendance.push(
        row
      );

    }

  }

  for (
    const row of
    snapshots || []
  ) {

    if (
      staffMap[
        row.staff_name
      ]
    ) {

      staffMap[
        row.staff_name
      ].snapshots.push(
        row
      );

    }

  }

  // =========================
  // BUILD PAYROLL
  // =========================

  const results = [];

  for (
    const key of
    Object.keys(
      staffMap
    )
  ) {

    const member =
      staffMap[key];

    const totalHours =
      member.shifts.reduce(
        (
          sum,
          shift
        ) => {

          if (
            !shift.clock_in ||
            !shift.clock_out
          ) return sum;

          const start =
            new Date(
              shift.clock_in
            );

          const end =
            new Date(
              shift.clock_out
            );

          const hours =
            (
              end - start
            ) /
            1000 /
            60 /
            60;

          return (
            sum +
            hours
          );

        },
        0
      );

    const completedShifts =
      member.shifts.filter(
        shift =>
          shift.shift_status ===
          "COMPLETED"
      ).length;

    const missedShifts =
      member.shifts.filter(
        shift =>
          !shift.clock_in
      ).length;

    const lateCount =
      member.shifts.filter(
        shift =>
          shift.is_late
      ).length;

    const totalLateMinutes =
      member.shifts.reduce(
        (
          sum,
          shift
        ) =>

          sum +

          Number(
            shift.late_minutes || 0
          ),

        0
      );

    const overtimeMinutes =
      member.shifts.reduce(
        (
          sum,
          shift
        ) =>

          sum +

          Number(
            shift.overtime_minutes || 0
          ),

        0
      );

    let attendanceScore =
      100;

    attendanceScore -=
      missedShifts * 15;

    attendanceScore -=
      lateCount * 5;

    attendanceScore -=
      Math.floor(
        totalLateMinutes / 10
      );

    attendanceScore +=
      Math.min(
        10,
        Math.floor(
          overtimeMinutes / 300
        )
      );

    attendanceScore =
      Math.max(
        0,
        Math.min(
          100,
          attendanceScore
        )
      );

    const serviceChargeBonus =
      member.snapshots.reduce(
        (
          sum,
          snapshot
        ) =>

          sum +

          Number(
            snapshot.payout || 0
          ),

        0
      );

    const baseSalary =
      15000;

    const deductions =
      lateCount * 100;

    const overtimeHours =
      Math.max(
        0,
        totalHours - 160
      );

    const overtimePay =
      overtimeHours * 100;

    const finalSalary =
      (
        baseSalary +

        overtimePay +

        serviceChargeBonus -

        deductions
      );

    const payrollRecord = {

      tenant_id:
        tenantId,

      staff_id:
        member.staff_id,

      staff_name:
        member.staff_name,

      role:
        member.role,

      department_cost_center:

        member.role === "CHEF"
          ? "KITCHEN"

        : member.role === "BARTENDER"
          ? "BAR"

        : member.role === "MARKETING"
          ? "MARKETING"

        : "FOH",

      total_hours:
        Number(
          totalHours.toFixed(2)
        ),

      overtime_hours:
        Number(
          overtimeHours.toFixed(2)
        ),

      attendance_score:
        attendanceScore,

      completed_shifts:
        completedShifts,

      missed_shifts:
        missedShifts,

      late_count:
        lateCount,

      total_late_minutes:
        totalLateMinutes,

      base_salary:
        baseSalary,

      overtime_pay:
        overtimePay,

      service_charge_bonus:
        Number(
          serviceChargeBonus.toFixed(2)
        ),

      deductions,

      final_salary:
        Number(
          finalSalary.toFixed(2)
        ),

      payroll_month:
        payrollMonth,

      status:
        PAYROLL_STATUS.GENERATED,

    };

    const {
      error:
        insertError,
    } = await supabaseAdmin

      .from(
        "payroll_records"
      )

      .insert(
        payrollRecord
      );

    if (
      insertError
    ) {

      throw insertError;

    }

    results.push(
      payrollRecord
    );

  }

  return {

    success: true,

    payroll:
      results,

  };

}
