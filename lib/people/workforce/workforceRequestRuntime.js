import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TIME_OFF_CLASSIFICATIONS = new Set(["APPROVED_LEAVE", "SICK_LEAVE"]);
const SWAP_OPEN = new Set(["PENDING_TARGET", "PENDING_MANAGER"]);

function required(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    const error = new Error(`${field} required`);
    error.status = 400;
    throw error;
  }
  return text;
}

function cleanDate(value, field) {
  const text = required(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must use YYYY-MM-DD`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${field} is invalid`);
  }
  return text;
}

function cleanReason(value) {
  const text = required(value, "reason");
  if (text.length < 3 || text.length > 1000) {
    const error = new Error("reason must be 3-1000 characters");
    error.status = 400;
    throw error;
  }
  return text;
}

function normalizeClassification(value) {
  const status = String(value || "APPROVED_LEAVE").trim().toUpperCase();
  if (!TIME_OFF_CLASSIFICATIONS.has(status)) {
    const error = new Error("Unsupported time-off attendance classification");
    error.status = 400;
    throw error;
  }
  return status;
}

async function activeStaff({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,party_id,name,email,role,position,department,active")
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error("Staff member is not active in this organization");
    notFound.status = 404;
    throw notFound;
  }
  return data;
}

export async function loadStaffWorkforceRequests({ organizationId, staffId }) {
  const [timeOffResult, swapResult, targetResult, scheduleResult] = await Promise.all([
    supabaseAdmin
      .from("staff_time_off_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .order("requested_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("staff_shift_swap_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("requester_staff_id", staffId)
      .order("requested_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("staff_shift_swap_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("target_staff_id", staffId)
      .order("requested_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("staff_schedules")
      .select("id,staff_id,staff_name,shift_date,start_time,end_time,shift_type,department,status")
      .eq("organization_id", organizationId)
      .eq("staff_id", staffId)
      .eq("status", "PUBLISHED")
      .gte("shift_date", new Date().toISOString().slice(0, 10))
      .order("shift_date", { ascending: true })
      .limit(60),
  ]);

  for (const result of [timeOffResult, swapResult, targetResult, scheduleResult]) {
    if (result.error) throw result.error;
  }

  const openScheduleIds = (swapResult.data || [])
    .filter((row) => SWAP_OPEN.has(row.status))
    .map((row) => row.schedule_id);

  return {
    timeOffRequests: timeOffResult.data || [],
    swapRequests: swapResult.data || [],
    incomingSwapRequests: targetResult.data || [],
    upcomingSchedules: (scheduleResult.data || []).map((row) => ({
      ...row,
      swapOpen: openScheduleIds.includes(row.id),
    })),
  };
}

export async function createTimeOffRequest({
  organizationId,
  staff,
  leaveType,
  attendanceClassification,
  startDate,
  endDate,
  reason,
}) {
  const start = cleanDate(startDate, "startDate");
  const end = cleanDate(endDate, "endDate");
  if (end < start) throw new Error("endDate cannot be before startDate");

  const { data, error } = await supabaseAdmin
    .from("staff_time_off_requests")
    .insert({
      organization_id: organizationId,
      staff_id: staff.id,
      party_id: staff.party_id || null,
      leave_type: required(leaveType, "leaveType"),
      attendance_classification: normalizeClassification(attendanceClassification),
      start_date: start,
      end_date: end,
      reason: cleanReason(reason),
      status: "PENDING",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const conflict = new Error("An active time-off request already exists for this exact date range");
      conflict.status = 409;
      conflict.code = "TIME_OFF_REQUEST_EXISTS";
      throw conflict;
    }
    throw error;
  }
  return data;
}

export async function cancelTimeOffRequest({ organizationId, staffId, requestId }) {
  const { data: current, error: loadError } = await supabaseAdmin
    .from("staff_time_off_requests")
    .select("id,status")
    .eq("id", required(requestId, "requestId"))
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw Object.assign(new Error("Time-off request not found"), { status: 404 });
  if (current.status !== "PENDING") {
    throw Object.assign(new Error("Only pending time-off requests can be cancelled by staff"), { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("staff_time_off_requests")
    .update({ status: "CANCELLED" })
    .eq("id", current.id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createShiftSwapRequest({ organizationId, staff, scheduleId, targetStaffId, reason }) {
  const target = await activeStaff({ organizationId, staffId: required(targetStaffId, "targetStaffId") });
  if (target.id === staff.id) throw new Error("Replacement staff must be different from requester");

  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from("staff_schedules")
    .select("id,staff_id,shift_date,start_time,end_time,status")
    .eq("id", required(scheduleId, "scheduleId"))
    .eq("organization_id", organizationId)
    .eq("staff_id", staff.id)
    .maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule || schedule.status !== "PUBLISHED") {
    throw Object.assign(new Error("Published schedule not found for requester"), { status: 404 });
  }

  const [shiftEvidence, attendanceEvidence, targetSchedule] = await Promise.all([
    supabaseAdmin.from("staff_shifts").select("id").eq("organization_id", organizationId).eq("schedule_id", schedule.id).limit(1),
    supabaseAdmin.from("staff_attendance").select("id").eq("organization_id", organizationId).eq("schedule_id", schedule.id).limit(1),
    supabaseAdmin.from("staff_schedules").select("id").eq("organization_id", organizationId).eq("staff_id", target.id).eq("shift_date", schedule.shift_date).limit(1),
  ]);
  for (const result of [shiftEvidence, attendanceEvidence, targetSchedule]) if (result.error) throw result.error;
  if ((shiftEvidence.data || []).length || (attendanceEvidence.data || []).length) {
    throw Object.assign(new Error("This shift already has workforce evidence and cannot be swapped"), { status: 409, code: "SCHEDULE_EVIDENCE_LOCKED" });
  }
  if ((targetSchedule.data || []).length) {
    throw Object.assign(new Error("Replacement staff already has a roster row on this date"), { status: 409, code: "TARGET_SCHEDULE_CONFLICT" });
  }

  const { data, error } = await supabaseAdmin
    .from("staff_shift_swap_requests")
    .insert({
      organization_id: organizationId,
      schedule_id: schedule.id,
      requester_staff_id: staff.id,
      requester_party_id: staff.party_id || null,
      target_staff_id: target.id,
      target_party_id: target.party_id || null,
      shift_date: schedule.shift_date,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      reason: cleanReason(reason),
      status: "PENDING_TARGET",
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const conflict = new Error("This schedule already has an open shift-swap request");
      conflict.status = 409;
      conflict.code = "SHIFT_SWAP_REQUEST_EXISTS";
      throw conflict;
    }
    throw error;
  }
  return data;
}

export async function respondToShiftSwapRequest({ organizationId, staffId, requestId, decision, notes }) {
  const normalized = String(decision || "").trim().toUpperCase();
  if (!["ACCEPT", "DECLINE"].includes(normalized)) throw new Error("decision must be ACCEPT or DECLINE");

  const { data: current, error: loadError } = await supabaseAdmin
    .from("staff_shift_swap_requests")
    .select("id,status")
    .eq("id", required(requestId, "requestId"))
    .eq("organization_id", organizationId)
    .eq("target_staff_id", staffId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw Object.assign(new Error("Shift-swap request not found"), { status: 404 });
  if (current.status !== "PENDING_TARGET") throw Object.assign(new Error("Shift swap is no longer waiting for your response"), { status: 409 });

  const { data, error } = await supabaseAdmin
    .from("staff_shift_swap_requests")
    .update({
      status: normalized === "ACCEPT" ? "PENDING_MANAGER" : "DECLINED",
      target_response_notes: String(notes || "").trim() || null,
      target_responded_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("organization_id", organizationId)
    .eq("status", "PENDING_TARGET")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Shift swap changed concurrently; refresh and try again"), { status: 409 });
  return data;
}

export async function cancelShiftSwapRequest({ organizationId, staffId, requestId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_shift_swap_requests")
    .update({ status: "CANCELLED" })
    .eq("id", required(requestId, "requestId"))
    .eq("organization_id", organizationId)
    .eq("requester_staff_id", staffId)
    .in("status", ["PENDING_TARGET", "PENDING_MANAGER"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Open shift-swap request not found"), { status: 409 });
  return data;
}

export async function loadWorkforceRequestReviewQueue({ organizationId }) {
  const [timeOffResult, swapsResult, staffResult] = await Promise.all([
    supabaseAdmin.from("staff_time_off_requests").select("*").eq("organization_id", organizationId).order("requested_at", { ascending: false }).limit(250),
    supabaseAdmin.from("staff_shift_swap_requests").select("*").eq("organization_id", organizationId).order("requested_at", { ascending: false }).limit(250),
    supabaseAdmin.from("staff_accounts").select("id,name,email,role,position,department,party_id,active").eq("active_organization_id", organizationId).order("name"),
  ]);
  for (const result of [timeOffResult, swapsResult, staffResult]) if (result.error) throw result.error;
  return { timeOffRequests: timeOffResult.data || [], swapRequests: swapsResult.data || [], staff: staffResult.data || [] };
}

export async function reviewTimeOffRequest({ organizationId, requestId, manager, decision, notes }) {
  const normalized = String(decision || "").trim().toUpperCase();
  if (!["APPROVE", "REJECT"].includes(normalized)) throw new Error("decision must be APPROVE or REJECT");

  const { data: current, error: loadError } = await supabaseAdmin
    .from("staff_time_off_requests")
    .select("*")
    .eq("id", required(requestId, "requestId"))
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!current) throw Object.assign(new Error("Time-off request not found"), { status: 404 });
  if (current.status !== "PENDING") throw Object.assign(new Error("Time-off request is no longer pending"), { status: 409 });

  if (normalized === "APPROVE") {
    const { data: schedules, error: scheduleError } = await supabaseAdmin
      .from("staff_schedules")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("staff_id", current.staff_id)
      .eq("status", "PUBLISHED")
      .gte("shift_date", current.start_date)
      .lte("shift_date", current.end_date);
    if (scheduleError) throw scheduleError;
    const ids = (schedules || []).map((row) => row.id);
    if (ids.length) {
      const { data: worked, error: workedError } = await supabaseAdmin
        .from("staff_shifts")
        .select("id,schedule_id")
        .eq("organization_id", organizationId)
        .in("schedule_id", ids)
        .limit(1);
      if (workedError) throw workedError;
      if ((worked || []).length) {
        throw Object.assign(new Error("Time off overlaps a schedule that already has worked shift evidence"), { status: 409, code: "TIME_OFF_WORKED_EVIDENCE_CONFLICT" });
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("staff_time_off_requests")
    .update({
      status: normalized === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewed_by_staff_id: manager.id,
      reviewed_by_party_id: manager.party_id || null,
      reviewed_at: new Date().toISOString(),
      review_notes: String(notes || "").trim() || null,
    })
    .eq("id", current.id)
    .eq("organization_id", organizationId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Time-off request changed concurrently; refresh and try again"), { status: 409 });
  return data;
}

export async function reviewShiftSwapRequest({ organizationId, requestId, manager, decision, notes }) {
  const normalized = String(decision || "").trim().toUpperCase();
  if (!["APPROVE", "REJECT"].includes(normalized)) throw new Error("decision must be APPROVE or REJECT");

  if (normalized === "APPROVE") {
    const { data, error } = await supabaseAdmin.rpc("approve_staff_shift_swap_atomic", {
      p_organization_id: organizationId,
      p_request_id: required(requestId, "requestId"),
      p_manager_staff_id: manager.id,
      p_review_notes: String(notes || "").trim() || null,
    });
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("staff_shift_swap_requests")
    .update({
      status: "REJECTED",
      reviewed_by_staff_id: manager.id,
      reviewed_by_party_id: manager.party_id || null,
      reviewed_at: new Date().toISOString(),
      review_notes: String(notes || "").trim() || null,
    })
    .eq("id", required(requestId, "requestId"))
    .eq("organization_id", organizationId)
    .eq("status", "PENDING_MANAGER")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Shift-swap request is not waiting for manager approval"), { status: 409 });
  return data;
}

export async function loadApprovedTimeOffForRange({ organizationId, staffId, startDate, endDate }) {
  const { data, error } = await supabaseAdmin
    .from("staff_time_off_requests")
    .select("id,staff_id,leave_type,attendance_classification,start_date,end_date,status,reviewed_at,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("status", "APPROVED")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data || [];
}
