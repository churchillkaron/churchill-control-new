export function projectStaffTimeOffRequest(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    leave_type: row.leave_type || null,
    attendance_classification: row.attendance_classification || null,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    reason: row.reason || null,
    status: row.status || null,
    requested_at: row.requested_at || null,
    reviewed_at: row.reviewed_at || null,
    review_notes: row.review_notes || null,
  };
}

export function projectStaffShiftSwapRequest(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    schedule_id: row.schedule_id || null,
    target_staff_id: row.target_staff_id || null,
    shift_date: row.shift_date || null,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    reason: row.reason || null,
    status: row.status || null,
    requested_at: row.requested_at || null,
    target_response_notes: row.target_response_notes || null,
    target_responded_at: row.target_responded_at || null,
    reviewed_at: row.reviewed_at || null,
    review_notes: row.review_notes || null,
  };
}

export function projectStaffWorkforceRequestLists(data = {}) {
  return {
    timeOffRequests: (data.timeOffRequests || []).map(projectStaffTimeOffRequest).filter(Boolean),
    swapRequests: (data.swapRequests || []).map(projectStaffShiftSwapRequest).filter(Boolean),
    incomingSwapRequests: (data.incomingSwapRequests || []).map(projectStaffShiftSwapRequest).filter(Boolean),
    upcomingSchedules: Array.isArray(data.upcomingSchedules) ? data.upcomingSchedules : [],
  };
}
export function projectStaffWorkforceMutation(action, result) {
  if (action === "request_time_off" || action === "cancel_time_off") {
    return projectStaffTimeOffRequest(result);
  }
  if (
    action === "request_shift_swap" ||
    action === "respond_shift_swap" ||
    action === "cancel_shift_swap"
  ) {
    return projectStaffShiftSwapRequest(result);
  }
  return null;
}

export default Object.freeze({
  projectStaffTimeOffRequest,
  projectStaffShiftSwapRequest,
  projectStaffWorkforceRequestLists,
  projectStaffWorkforceMutation,
});
