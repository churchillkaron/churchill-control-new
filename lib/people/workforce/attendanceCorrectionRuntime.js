import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import {
  localDateString,
  resolveOrganizationTimeContext,
  scheduleWindow,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

const MAX_CORRECTED_SHIFT_MINUTES = 36 * 60;

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function correctionNumber(row) {
  const value = Number(row?.correction_no || 0);
  return Number.isFinite(value) ? value : 0;
}

function latestCorrectionMap(corrections = []) {
  const map = new Map();

  for (const correction of corrections) {
    if (!correction?.shift_id) continue;

    const current = map.get(correction.shift_id);
    if (!current || correctionNumber(correction) >= correctionNumber(current)) {
      map.set(correction.shift_id, correction);
    }
  }

  return map;
}

export async function loadAttendanceCorrections({
  organizationId,
  shiftIds = [],
}) {
  if (!organizationId) throw new Error("organizationId required");

  const ids = uniqueStrings(shiftIds);
  if (!ids.length) return [];

  const { data, error } = await supabaseAdmin
    .from("staff_attendance_corrections")
    .select("*")
    .eq("organization_id", organizationId)
    .in("shift_id", ids)
    .order("correction_no", { ascending: true });

  if (error) throw error;
  return data || [];
}

export function applyEffectiveShiftCorrections({
  shifts = [],
  corrections = [],
}) {
  const latestByShift = latestCorrectionMap(corrections);

  return shifts.map((shift) => {
    const correction = latestByShift.get(shift.id) || null;

    if (!correction) {
      return {
        ...shift,
        raw_clock_in: shift.clock_in || null,
        raw_clock_out: shift.clock_out || null,
        raw_worked_minutes: Number(shift.worked_minutes || 0),
        raw_overtime_minutes: Number(shift.overtime_minutes || 0),
        raw_late_minutes: Number(shift.late_minutes || 0),
        raw_is_late: shift.is_late,
        attendance_correction_id: null,
        attendance_correction_no: null,
        attendance_correction_reason: null,
        attendance_corrected_by: null,
        attendance_corrected_at: null,
      };
    }

    return {
      ...shift,
      raw_clock_in: shift.clock_in || null,
      raw_clock_out: shift.clock_out || null,
      raw_worked_minutes: Number(shift.worked_minutes || 0),
      raw_overtime_minutes: Number(shift.overtime_minutes || 0),
      raw_late_minutes: Number(shift.late_minutes || 0),
      raw_is_late: shift.is_late,
      clock_in: correction.corrected_clock_in,
      clock_out: correction.corrected_clock_out,
      worked_minutes: Number(correction.corrected_worked_minutes || 0),
      overtime_minutes: Number(correction.corrected_overtime_minutes || 0),
      late_minutes: Number(correction.corrected_late_minutes || 0),
      is_late: correction.corrected_is_late,
      attendance_correction_id: correction.id,
      attendance_correction_no: correction.correction_no,
      attendance_correction_reason: correction.correction_reason,
      attendance_corrected_by: correction.approved_by_name,
      attendance_corrected_at: correction.approved_at,
    };
  });
}

function parseOrganizationLocalDateTime({ value, timezone, fieldName }) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );

  if (!match) {
    const error = new Error(`${fieldName} must use YYYY-MM-DDTHH:MM format`);
    error.status = 400;
    throw error;
  }

  const date = match[1];
  const time = `${match[2]}:${match[3]}:${match[4] || "00"}`;
  const instant = zonedDateTimeToUtc({ date, time, timezone });

  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    const error = new Error(`${fieldName} is not a valid organization-local time`);
    error.status = 400;
    throw error;
  }

  return { date, instant };
}

function workedMinutesBetween(start, end) {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(minutes) ? minutes : 0;
}

async function loadShiftForCorrection({ organizationId, shiftId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("id", shiftId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const notFound = new Error("Shift not found in organization");
    notFound.status = 404;
    throw notFound;
  }

  return data;
}

async function loadScheduleForShift({ organizationId, shift }) {
  if (!shift?.schedule_id) return null;

  const { data, error } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("id", shift.schedule_id)
    .eq("organization_id", organizationId)
    .eq("staff_id", shift.staff_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function validateCorrectableShift(shift) {
  const approvalStatus = String(shift?.approval_status || "").toUpperCase();
  const completed =
    String(shift?.shift_status || "").toUpperCase() === "COMPLETED" ||
    Boolean(shift?.clock_out);

  if (!completed || !shift?.clock_out) {
    const error = new Error(
      "Only completed shifts with raw clock-out evidence can be corrected"
    );
    error.status = 409;
    error.code = "ATTENDANCE_CORRECTION_SHIFT_NOT_COMPLETED";
    throw error;
  }

  if (
    shift?.is_valid === false ||
    approvalStatus === "REJECTED" ||
    approvalStatus === "PENDING"
  ) {
    const error = new Error(
      "Shift must be approved workforce evidence before it can be corrected"
    );
    error.status = 409;
    error.code = "ATTENDANCE_CORRECTION_SHIFT_NOT_APPROVED";
    throw error;
  }
}

function validateReason(value) {
  const reason = String(value || "").trim();

  if (reason.length < 3) {
    const error = new Error("Correction reason must be at least 3 characters");
    error.status = 400;
    throw error;
  }

  if (reason.length > 1000) {
    const error = new Error("Correction reason must be 1000 characters or fewer");
    error.status = 400;
    throw error;
  }

  return reason;
}

export async function createAttendanceCorrection({
  organizationId,
  shiftId,
  manager,
  correctedClockInLocal,
  correctedClockOutLocal,
  reason,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!shiftId) throw new Error("shiftId required");
  if (!manager?.id) throw new Error("manager staff identity required");

  const correctionReason = validateReason(reason);
  const shift = await loadShiftForCorrection({ organizationId, shiftId });
  validateCorrectableShift(shift);

  const [timeContext, schedule, workforceSettings, existingCorrections] =
    await Promise.all([
      resolveOrganizationTimeContext({ organizationId }),
      loadScheduleForShift({ organizationId, shift }),
      loadOperationalSettings({
        organizationId,
        domain: "WORKFORCE",
      }),
      loadAttendanceCorrections({
        organizationId,
        shiftIds: [shift.id],
      }),
    ]);

  const correctedIn = parseOrganizationLocalDateTime({
    value: correctedClockInLocal,
    timezone: timeContext.timezone,
    fieldName: "correctedClockInLocal",
  });
  const correctedOut = parseOrganizationLocalDateTime({
    value: correctedClockOutLocal,
    timezone: timeContext.timezone,
    fieldName: "correctedClockOutLocal",
  });

  const businessDate =
    schedule?.shift_date ||
    localDateString(new Date(shift.clock_in), timeContext.timezone);

  if (correctedIn.date !== businessDate) {
    const error = new Error(
      `Corrected clock-in must remain on workforce business date ${businessDate}`
    );
    error.status = 409;
    error.code = "ATTENDANCE_CORRECTION_BUSINESS_DATE_CHANGE";
    throw error;
  }

  const correctedWorkedMinutes = workedMinutesBetween(
    correctedIn.instant,
    correctedOut.instant
  );

  if (correctedWorkedMinutes <= 0) {
    const error = new Error("Corrected clock-out must be after corrected clock-in");
    error.status = 400;
    throw error;
  }

  if (correctedWorkedMinutes > MAX_CORRECTED_SHIFT_MINUTES) {
    const error = new Error(
      `Corrected shift duration cannot exceed ${MAX_CORRECTED_SHIFT_MINUTES / 60} hours`
    );
    error.status = 400;
    throw error;
  }

  const scheduleTiming = schedule
    ? scheduleWindow({
        shiftDate: schedule.shift_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        timezone: timeContext.timezone,
      })
    : null;

  const correctedLateMinutes = scheduleTiming?.start
    ? Math.max(
        0,
        Math.floor(
          (correctedIn.instant.getTime() - scheduleTiming.start.getTime()) / 60000
        )
      )
    : 0;

  const scheduledMinutes = scheduleTiming?.durationMinutes ?? null;
  const correctedOvertimeMinutes =
    Number.isFinite(scheduledMinutes) && scheduledMinutes > 0
      ? Math.max(0, correctedWorkedMinutes - scheduledMinutes)
      : 0;

  const lateThresholdMinutes = nonNegativeInteger(
    workforceSettings?.late_threshold_minutes
  );
  const correctedIsLate =
    lateThresholdMinutes === null
      ? null
      : correctedLateMinutes > lateThresholdMinutes;

  const latestCorrection = latestCorrectionMap(existingCorrections).get(shift.id) || null;
  const effectiveBefore = applyEffectiveShiftCorrections({
    shifts: [shift],
    corrections: existingCorrections,
  })[0];

  if (
    new Date(effectiveBefore.clock_in).getTime() === correctedIn.instant.getTime() &&
    new Date(effectiveBefore.clock_out).getTime() === correctedOut.instant.getTime()
  ) {
    const error = new Error("Correction does not change the effective shift evidence");
    error.status = 409;
    error.code = "ATTENDANCE_CORRECTION_NO_CHANGE";
    throw error;
  }

  const approvedAt = new Date().toISOString();
  const managerName = manager.name || manager.email || "Manager";

  const { data, error } = await supabaseAdmin
    .from("staff_attendance_corrections")
    .insert({
      organization_id: organizationId,
      staff_id: shift.staff_id,
      party_id: shift.party_id || null,
      shift_id: shift.id,
      schedule_id: shift.schedule_id || null,
      supersedes_correction_id: latestCorrection?.id || null,
      raw_clock_in: shift.clock_in,
      raw_clock_out: shift.clock_out,
      raw_worked_minutes: Number(shift.worked_minutes || 0),
      raw_overtime_minutes: Number(shift.overtime_minutes || 0),
      raw_late_minutes: Number(shift.late_minutes || 0),
      corrected_clock_in: correctedIn.instant.toISOString(),
      corrected_clock_out: correctedOut.instant.toISOString(),
      corrected_worked_minutes: correctedWorkedMinutes,
      corrected_overtime_minutes: correctedOvertimeMinutes,
      corrected_late_minutes: correctedLateMinutes,
      corrected_is_late: correctedIsLate,
      late_threshold_minutes: lateThresholdMinutes,
      correction_reason: correctionReason,
      approved_by_staff_id: manager.id,
      approved_by_party_id: manager.party_id || null,
      approved_by_name: managerName,
      approved_at: approvedAt,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const conflict = new Error(
        "Attendance evidence changed while this correction was being saved. Refresh and review the latest correction before trying again."
      );
      conflict.status = 409;
      conflict.code = "ATTENDANCE_CORRECTION_CONFLICT";
      throw conflict;
    }
    throw error;
  }

  return {
    timezone: timeContext.timezone,
    businessDate,
    correction: data,
    effectiveShift: applyEffectiveShiftCorrections({
      shifts: [shift],
      corrections: [...existingCorrections, data],
    })[0],
  };
}

export default applyEffectiveShiftCorrections;
