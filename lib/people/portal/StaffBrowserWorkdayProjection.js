function value(row, key) {
  return row && row[key] !== undefined ? row[key] : null;
}

export function projectStaffSchedule(row) {
  if (!row) return null;
  return {
    id: value(row, "id"),
    shift_date: value(row, "shift_date"),
    start_time: value(row, "start_time"),
    end_time: value(row, "end_time"),
    status: value(row, "status"),
    shift_type: value(row, "shift_type"),
    department: value(row, "department"),
    section: value(row, "section"),
  };
}

export function projectStaffShift(row) {
  if (!row) return null;
  return {
    id: value(row, "id"),
    schedule_id: value(row, "schedule_id"),
    clock_in: value(row, "clock_in"),
    clock_out: value(row, "clock_out"),
    shift_status: value(row, "shift_status"),
    shift_source: value(row, "shift_source"),
    approval_status: value(row, "approval_status"),
    is_late: value(row, "is_late"),
    late_minutes: value(row, "late_minutes"),
    scheduled_start: value(row, "scheduled_start"),
    scheduled_end: value(row, "scheduled_end"),
    worked_minutes: value(row, "worked_minutes"),
    overtime_minutes: value(row, "overtime_minutes"),
  };
}

export function projectStaffAttendance(row) {
  if (!row) return null;
  return {
    id: value(row, "id"),
    shift_date: value(row, "shift_date"),
    actual_start: value(row, "actual_start"),
    actual_end: value(row, "actual_end"),
    attendance_status: value(row, "attendance_status"),
    late_minutes: value(row, "late_minutes"),
  };
}
export function projectStaffShiftResult(result = {}) {
  return {
    timezone: result.timezone || null,
    businessDate: result.businessDate || null,
    schedule: projectStaffSchedule(result.schedule),
    shift: projectStaffShift(result.shift),
    attendance: projectStaffAttendance(result.attendance),
    late: result.late ?? null,
    lateMinutes: result.lateMinutes ?? null,
    locationVerified: result.locationVerified === true,
    gpsExceptionUsed: result.gpsExceptionUsed === true,
  };
}

export default Object.freeze({
  projectStaffSchedule,
  projectStaffShift,
  projectStaffAttendance,
  projectStaffShiftResult,
});
