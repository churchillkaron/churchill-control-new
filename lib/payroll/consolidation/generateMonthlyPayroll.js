import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import calculateDailyPayouts from "@/lib/payroll/serviceCharge/calculateDailyPayouts";
import { generatePayrollRecords } from "@/lib/payroll/generatePayrollRecords";
import { calculateAttendanceScore } from "@/lib/people/employees/calculateAttendanceScore";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";

function monthRange(payrollMonth) {
  const start = `${payrollMonth}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end: end.toISOString().slice(0, 10) };
}

function monthEnd(payrollMonth) {
  const date = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function hoursBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end - start) / 3600000);
}

function timeStringHours(startTime, endTime, dateValue) {
  if (!startTime || !endTime || !dateValue) return 0;
  const start = new Date(`${dateValue}T${startTime}+07:00`);
  const end = new Date(`${dateValue}T${endTime}+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end - start) / 3600000);
}

function fallbackExpectedHours(payrollMonth, settings) {
  const start = new Date(`${payrollMonth}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const daysInMonth = Math.round((end - start) / 86400000);
  const workingDaysPerWeek = Number(settings?.default_working_days_per_week || 0);
  const hoursPerShift = Number(settings?.default_hours_per_shift || 0);

  if (!workingDaysPerWeek || !hoursPerShift) return 0;

  return Number(
    (daysInMonth * (workingDaysPerWeek / 7) * hoursPerShift).toFixed(2)
  );
}

export default async function generateMonthlyPayroll({
  organizationId,
  entityId,
  payrollMonth,
  requestedBy = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!payrollMonth) throw new Error("payrollMonth required");

  const range = monthRange(payrollMonth);
  const payrollSettings = await loadOperationalSettings({
    organizationId,
    domain: "PAYROLL",
  });

  const [staffResult, compensationResult, shiftsResult, attendanceResult, schedulesResult, ordersResult] =
    await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select("*")
        .eq("active_organization_id", organizationId)
        .eq("active", true),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .lte("effective_from", monthEnd(payrollMonth))
        .or(`effective_to.is.null,effective_to.gte.${range.start}`),
      supabaseAdmin
        .from("staff_shifts")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("clock_in", `${range.start}T00:00:00+07:00`)
        .lt("clock_in", `${range.end}T00:00:00+07:00`),
      supabaseAdmin
        .from("staff_attendance")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end),
      supabaseAdmin
        .from("staff_schedules")
        .select("*")
        .eq("organization_id", organizationId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end),
      supabaseAdmin
        .from("orders")
        .select("service_charge,service_charge_amount")
        .eq("organization_id", organizationId)
        .eq("payment_status", "PAID")
        .gte("completed_at", `${range.start}T00:00:00+07:00`)
        .lt("completed_at", `${range.end}T00:00:00+07:00`),
    ]);

  for (const result of [
    staffResult,
    compensationResult,
    shiftsResult,
    attendanceResult,
    schedulesResult,
    ordersResult,
  ]) {
    if (result.error) throw result.error;
  }

  const compensationByStaff = new Map(
    (compensationResult.data || []).map((profile) => [profile.staff_account_id, profile])
  );

  const staff = (staffResult.data || []).filter((member) =>
    compensationByStaff.has(member.id)
  );
  const shifts = shiftsResult.data || [];
  const attendance = attendanceResult.data || [];
  const schedules = schedulesResult.data || [];

  const totalServiceCharge = (ordersResult.data || []).reduce(
    (sum, order) =>
      sum + Number(order.service_charge_amount ?? order.service_charge ?? 0),
    0
  );

  const staffPerformance = staff.map((member) => {
    const profile = compensationByStaff.get(member.id);
    const memberShifts = shifts.filter((shift) => shift.staff_id === member.id);
    const memberAttendance = attendance.filter((row) => row.staff_id === member.id);
    const memberSchedules = schedules.filter((row) => row.staff_id === member.id);

    const scheduleHours = memberSchedules.reduce(
      (sum, schedule) =>
        sum +
        timeStringHours(
          schedule.start_time,
          schedule.end_time,
          schedule.shift_date
        ),
      0
    );

    const expectedHours =
      payrollSettings?.use_schedule_expected_hours && scheduleHours > 0
        ? scheduleHours
        : fallbackExpectedHours(payrollMonth, payrollSettings);

    const totalHours = memberShifts.reduce(
      (sum, shift) => sum + hoursBetween(shift.clock_in, shift.clock_out),
      0
    );

    const completedShifts = memberShifts.filter(
      (shift) => shift.shift_status === "COMPLETED" || Boolean(shift.clock_out)
    ).length;
    const workedScheduleIds = new Set(
      memberShifts.map((shift) => shift.schedule_id).filter(Boolean)
    );
    const missedShifts = memberSchedules.filter(
      (schedule) => !workedScheduleIds.has(schedule.id)
    ).length;
    const lateCount = memberShifts.filter((shift) => shift.is_late).length;
    const shiftLateMinutes = memberShifts.reduce(
      (sum, shift) => sum + Number(shift.late_minutes || 0),
      0
    );
    const attendanceLateMinutes = memberAttendance.reduce(
      (sum, row) => sum + Number(row.late_minutes || 0),
      0
    );
    const finalLateMinutes = Math.max(shiftLateMinutes, attendanceLateMinutes);
    const overtimeHours = Number(
      (memberShifts.reduce(
        (sum, shift) => sum + Number(shift.overtime_minutes || 0),
        0
      ) / 60).toFixed(2)
    );
    const workedHours = Number(totalHours.toFixed(2));
    const varianceHours = Number((workedHours - expectedHours).toFixed(2));
    const hasPayrollExposure =
      Number(profile?.monthly_salary || 0) > 0 ||
      Number(profile?.hourly_rate || 0) > 0;
    const reviewRequired =
      hasPayrollExposure &&
      Boolean(payrollSettings?.manager_approval_required) &&
      Math.abs(varianceHours) > Number(payrollSettings?.variance_threshold_hours || 0);

    const attendanceScore = calculateAttendanceScore({
      lateMinutes: finalLateMinutes,
      overtimeHours,
    });

    return {
      id: member.id,
      partyId: member.party_id,
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
      reviewReason: reviewRequired ? "Hours variance requires manager review" : null,
      overtimeHours,
      attendanceScore,
      completedShifts,
      missedShifts,
      lateCount,
      totalLateMinutes: finalLateMinutes,
      multiplier: Number((attendanceScore / 100).toFixed(2)),
      baseSalary: Number(profile?.monthly_salary || 0),
      hourlyRate: Number(profile?.hourly_rate || 0),
    };
  });

  const payoutResult = await calculateDailyPayouts({
    organizationId,
    serviceCharge: totalServiceCharge,
    staffPerformance,
  });

  const payrollData = payoutResult.map((member) => ({
    ...member,
    serviceChargeBonus: Number(member.payout || 0),
  }));

  const { data: existingPayroll, error: existingPayrollError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("payroll_month", payrollMonth);

  if (existingPayrollError) throw existingPayrollError;

  const replaceableStatuses = new Set(["GENERATED", "RECALCULATED", "REJECTED"]);
  const lockedPayroll = (existingPayroll || []).filter(
    (record) => !replaceableStatuses.has(record.status)
  );

  if (lockedPayroll.length > 0) {
    throw new Error("Payroll already approved or locked for this month");
  }

  const existingIds = (existingPayroll || []).map((record) => record.id);

  if (existingIds.length > 0) {
    const { error: approvalDeleteError } = await supabaseAdmin
      .from("approval_requests")
      .delete()
      .eq("organization_id", organizationId)
      .eq("reference_table", "payroll_records")
      .in("reference_id", existingIds);

    if (approvalDeleteError) throw approvalDeleteError;

    const { error: payrollDeleteError } = await supabaseAdmin
      .from("payroll_records")
      .delete()
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("payroll_month", payrollMonth)
      .in("status", ["GENERATED", "RECALCULATED", "REJECTED"]);

    if (payrollDeleteError) throw payrollDeleteError;
  }

  const records = await generatePayrollRecords({
    organizationId,
    entityId,
    payrollMonth,
    payrollData,
    approvedBy: requestedBy,
  });

  return {
    success: true,
    organizationId,
    entityId,
    payrollMonth,
    totalServiceCharge: Number(totalServiceCharge.toFixed(2)),
    staffCount: payrollData.length,
    records,
  };
}
