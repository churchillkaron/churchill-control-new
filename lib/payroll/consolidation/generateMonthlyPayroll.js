import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import calculateDailyPayouts from "@/lib/payroll/serviceCharge/calculateDailyPayouts";
import { generatePayrollRecords } from "@/lib/payroll/generatePayrollRecords";
import { calculateAttendanceScore } from "@/lib/staff/calculateAttendanceScore";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";

function monthRange(payrollMonth) {
  const start = `${payrollMonth}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    start,
    end: end.toISOString().slice(0, 10),
  };
}

function hoursBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end - start) / 1000 / 60 / 60);
}

function timeStringHours(startTime, endTime, dateValue) {
  if (!startTime || !endTime || !dateValue) return 0;

  const start = new Date(`${dateValue}T${startTime}`);
  const end = new Date(`${dateValue}T${endTime}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, (end - start) / 1000 / 60 / 60);
}

function fallbackExpectedHours(payrollMonth, settings) {
  const start = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const daysInMonth = Math.round((end - start) / 1000 / 60 / 60 / 24);

  const workingDaysPerWeek = Number(
    settings?.default_working_days_per_week || 6
  );

  const hoursPerShift = Number(
    settings?.default_hours_per_shift || 9
  );

  return Number(
    (
      daysInMonth *
      (workingDaysPerWeek / 7) *
      hoursPerShift
    ).toFixed(2)
  );
}

export default async function generateMonthlyPayroll({
  tenantId,
  payrollMonth,
}) {
  if (!tenantId) {
    throw new Error("tenantId required");
  }

  if (!payrollMonth) {
    throw new Error("payrollMonth required");
  }

  const range = monthRange(payrollMonth);

  const payrollSettings = await loadOperationalSettings({
    tenantId,
    domain: "PAYROLL",
  });

  console.log(
    "PAYROLL_SETTINGS",
    payrollSettings
  );

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  if (staffError) throw staffError;

  const { data: shifts, error: shiftsError } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("clock_in", range.start)
    .lt("clock_in", range.end);

  if (shiftsError) throw shiftsError;

  const { data: attendance, error: attendanceError } = await supabaseAdmin
    .from("staff_attendance")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.start)
    .lt("created_at", range.end);

  if (attendanceError) throw attendanceError;

  const { data: schedules, error: schedulesError } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("shift_date", range.start)
    .lt("shift_date", range.end);

  if (schedulesError) throw schedulesError;

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from("orders")
    .select("service_charge")
    .eq("tenant_id", tenantId)
    .eq("payment_status", "PAID")
    .gte("completed_at", range.start)
    .lt("completed_at", range.end);

  if (ordersError) throw ordersError;

  const totalServiceCharge = (orders || []).reduce(
    (sum, order) => sum + Number(order.service_charge || 0),
    0
  );

  const staffPerformance = (staff || []).map((member) => {
    const memberShifts = (shifts || []).filter(
      (shift) => shift.staff_id === member.id
    );

    const memberAttendance = (attendance || []).filter(
      (row) => row.staff_id === member.id
    );

    const memberSchedules = (schedules || []).filter((schedule) => {
      return (
        schedule.staff_id === member.id ||
        schedule.staff_name === member.name
      );
    });

    const scheduleHours = memberSchedules.reduce((sum, schedule) => {
      return sum + timeStringHours(
        schedule.start_time,
        schedule.end_time,
        schedule.shift_date
      );
    }, 0);

    const expectedHours =
      payrollSettings?.use_schedule_expected_hours &&
      scheduleHours > 0
        ? scheduleHours
        : fallbackExpectedHours(payrollMonth, payrollSettings);

    const totalHours = memberShifts.reduce((sum, shift) => {
      return sum + hoursBetween(shift.clock_in, shift.clock_out);
    }, 0);

    const completedShifts = memberShifts.filter((shift) => {
      return shift.shift_status === "COMPLETED" || shift.clock_out;
    }).length;

    const missedShifts = memberShifts.filter((shift) => {
      return !shift.clock_in;
    }).length;

    const lateCount = memberShifts.filter((shift) => {
      return shift.is_late;
    }).length;

    const totalLateMinutes = memberShifts.reduce((sum, shift) => {
      return sum + Number(shift.late_minutes || 0);
    }, 0);

    const attendanceLateMinutes = memberAttendance.reduce((sum, row) => {
      return sum + Number(row.late_minutes || 0);
    }, 0);

    const finalLateMinutes = totalLateMinutes || attendanceLateMinutes;

    const overtimeHours = Math.max(0, totalHours - completedShifts * 8);

    const workedHours = Number(totalHours.toFixed(2));

    const varianceHours = Number(
      (
        workedHours -
        expectedHours
      ).toFixed(2)
    );

    const hasPayrollExposure =
      Number(member.monthly_salary || 0) > 0 ||
      Number(member.hourly_rate || 0) > 0;

    const reviewRequired =
      hasPayrollExposure &&
      Boolean(payrollSettings?.manager_approval_required) &&
      Math.abs(varianceHours) >
        Number(payrollSettings?.variance_threshold_hours || 1);

    const attendanceScore = calculateAttendanceScore({
      lateMinutes: finalLateMinutes,
      overtimeHours,
    });

    return {
      id: member.id,
      name: member.name || member.email,
      role: member.role,
      department: member.department || member.position || "UNASSIGNED",
      position: member.position,
      totalHours: workedHours,
      expectedHours: Number(expectedHours.toFixed(2)),
      workedHours,
      approvedHours: workedHours,
      varianceHours,
      reviewRequired,
      reviewStatus: reviewRequired ? "PENDING" : "NOT_REQUIRED",
      overtimeHours: Number(overtimeHours.toFixed(2)),
      attendanceScore,
      completedShifts,
      missedShifts,
      lateCount,
      totalLateMinutes: finalLateMinutes,
      multiplier: Number((attendanceScore / 100).toFixed(2)),
      baseSalary: Number(member.monthly_salary || 0),
      hourlyRate: Number(member.hourly_rate || 0),
    };
  });

  const payoutResult = await calculateDailyPayouts({
    tenantId,
    serviceCharge: totalServiceCharge,
    staffPerformance,
  });

  const payrollData = payoutResult.map((member) => ({
    ...member,
    serviceChargeBonus: Number(member.payout || 0),
  }));

  const { data: existingPayroll, error: existingPayrollError } =
    await supabaseAdmin
      .from("payroll_records")
      .select("id,status")
      .eq("tenant_id", tenantId)
      .eq("payroll_month", payrollMonth);

  if (existingPayrollError) throw existingPayrollError;

  const lockedPayroll =
    (existingPayroll || []).filter((record) => {
      return ![
        "GENERATED",
        "RECALCULATED",
        "REJECTED",
      ].includes(record.status);
    });

  if (lockedPayroll.length > 0) {
    throw new Error(
      "Payroll already approved or locked for this month"
    );
  }

  const existingIds =
    (existingPayroll || []).map((record) => record.id);

  if (existingIds.length > 0) {
    await supabaseAdmin
      .from("approval_requests")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("reference_table", "payroll_records")
      .in("reference_id", existingIds);

    const { error: deletePayrollError } =
      await supabaseAdmin
        .from("payroll_records")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("payroll_month", payrollMonth)
        .in("status", [
          "GENERATED",
          "RECALCULATED",
          "REJECTED",
        ]);

    if (deletePayrollError) throw deletePayrollError;
  }

  const records = await generatePayrollRecords({
    tenantId,
    payrollData,
  });

  return {
    success: true,
    payrollMonth,
    totalServiceCharge,
    staffCount: payrollData.length,
    records,
  };
}
