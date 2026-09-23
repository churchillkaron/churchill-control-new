function pattern(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    weekday: row.weekday ?? null,
    availability_type: row.availability_type || null,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    notes: row.notes || null,
    status: row.status || null,
    effective_from: row.effective_from || null,
    effective_to: row.effective_to || null,
  };
}

function exception(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    exception_date: row.exception_date || null,
    availability_type: row.availability_type || null,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    notes: row.notes || null,
    status: row.status || null,
  };
}

export function projectStaffAvailability(data = {}) {
  return {
    timezone: data.timezone || null,
    today: data.today || null,
    patterns: (data.patterns || []).map(pattern).filter(Boolean),
    exceptions: (data.exceptions || []).map(exception).filter(Boolean),
    upcomingSchedules: Array.isArray(data.upcomingSchedules)
      ? data.upcomingSchedules
      : [],
  };
}

export default Object.freeze({ projectStaffAvailability });
