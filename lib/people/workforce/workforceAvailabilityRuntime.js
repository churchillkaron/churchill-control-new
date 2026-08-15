import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { localDateString, resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";

function cleanDate(value, field = "date") {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must use YYYY-MM-DD format`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error(`${field} is invalid`);
  return text;
}

function cleanTime(value, field = "time", optional = true) {
  const text = String(value || "").trim();
  if (!text && optional) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`${field} must use HH:MM format`);
  return text;
}

function cleanType(value) {
  const type = String(value || "").trim().toUpperCase();
  if (!["AVAILABLE", "UNAVAILABLE"].includes(type)) throw new Error("availabilityType must be AVAILABLE or UNAVAILABLE");
  return type;
}

function cleanNotes(value) {
  const notes = String(value || "").trim();
  if (notes.length > 1000) throw new Error("Availability notes are too long");
  return notes || null;
}

function minutes(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function interval(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const start = minutes(startTime);
  let end = minutes(endTime);
  if (end <= start) end += 1440;
  return { start, end };
}

function overlaps(a, b) { return a.start < b.end && b.start < a.end; }
function contains(a, b) { return a.start <= b.start && a.end >= b.end; }
function weekdayOf(dateValue) { return new Date(`${dateValue}T00:00:00.000Z`).getUTCDay(); }
function effectiveOn(row, dateValue) {
  return String(row?.status || "ACTIVE").toUpperCase() === "ACTIVE" && String(row?.effective_from || "") <= dateValue && (!row?.effective_to || String(row.effective_to) >= dateValue);
}
function activeException(row) { return String(row?.status || "ACTIVE").toUpperCase() === "ACTIVE"; }
function description(row) {
  const unavailable = String(row?.availability_type || "").toUpperCase() === "UNAVAILABLE";
  if (!row?.start_time || !row?.end_time) return unavailable ? "Unavailable all day" : "Available all day";
  return `${unavailable ? "Unavailable" : "Available"} ${row.start_time}-${row.end_time}`;
}

export function evaluateScheduleAvailability({ staffId, shiftDate, startTime, endTime, patterns = [], exceptions = [] } = {}) {
  const date = cleanDate(shiftDate, "shiftDate");
  const shiftInterval = interval(cleanTime(startTime, "startTime", false), cleanTime(endTime, "endTime", false));
  const dateExceptions = exceptions.filter((row) => row?.staff_id === staffId && String(row?.exception_date || "") === date && activeException(row));

  if (dateExceptions.length) {
    const unavailable = dateExceptions.filter((row) => String(row?.availability_type || "").toUpperCase() === "UNAVAILABLE");
    const allDay = unavailable.find((row) => !row.start_time && !row.end_time);
    if (allDay) return { conflict: true, reason: description(allDay), sourceType: "EXCEPTION", sourceId: allDay.id };
    const blocked = unavailable.find((row) => overlaps(interval(row.start_time, row.end_time), shiftInterval));
    if (blocked) return { conflict: true, reason: description(blocked), sourceType: "EXCEPTION", sourceId: blocked.id };
    const available = dateExceptions.filter((row) => String(row?.availability_type || "").toUpperCase() === "AVAILABLE");
    if (available.length && !available.some((row) => (!row.start_time && !row.end_time) || contains(interval(row.start_time, row.end_time), shiftInterval))) {
      return { conflict: true, reason: `Outside stated date-specific availability (${available.map(description).join(", ")})`, sourceType: "EXCEPTION", sourceId: available[0]?.id || null };
    }
    return { conflict: false, reason: null, sourceType: "EXCEPTION", sourceId: null };
  }

  const weekday = weekdayOf(date);
  const rules = patterns.filter((row) => row?.staff_id === staffId && Number(row?.weekday) === weekday && effectiveOn(row, date));
  if (!rules.length) return { conflict: false, reason: null, sourceType: null, sourceId: null };
  const unavailable = rules.filter((row) => String(row?.availability_type || "").toUpperCase() === "UNAVAILABLE");
  const allDay = unavailable.find((row) => !row.start_time && !row.end_time);
  if (allDay) return { conflict: true, reason: description(allDay), sourceType: "PATTERN", sourceId: allDay.id };
  const blocked = unavailable.find((row) => overlaps(interval(row.start_time, row.end_time), shiftInterval));
  if (blocked) return { conflict: true, reason: description(blocked), sourceType: "PATTERN", sourceId: blocked.id };
  const available = rules.filter((row) => String(row?.availability_type || "").toUpperCase() === "AVAILABLE");
  if (available.length && !available.some((row) => (!row.start_time && !row.end_time) || contains(interval(row.start_time, row.end_time), shiftInterval))) {
    return { conflict: true, reason: `Outside recurring availability (${available.map(description).join(", ")})`, sourceType: "PATTERN", sourceId: available[0]?.id || null };
  }
  return { conflict: false, reason: null, sourceType: "PATTERN", sourceId: null };
}

export async function loadAvailabilityForScheduleRange({ organizationId, staffIds = [], startDate, endDate } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  const ids = [...new Set(staffIds.map(String).filter(Boolean))];
  if (!ids.length) return { patterns: [], exceptions: [] };
  const start = cleanDate(startDate, "startDate");
  const end = cleanDate(endDate, "endDate");
  const [patternsResult, exceptionsResult] = await Promise.all([
    supabaseAdmin.from("staff_availability_patterns").select("*").eq("organization_id", organizationId).in("staff_id", ids).eq("status", "ACTIVE").lte("effective_from", end).or(`effective_to.is.null,effective_to.gte.${start}`),
    supabaseAdmin.from("staff_availability_exceptions").select("*").eq("organization_id", organizationId).in("staff_id", ids).eq("status", "ACTIVE").gte("exception_date", start).lte("exception_date", end),
  ]);
  if (patternsResult.error) throw patternsResult.error;
  if (exceptionsResult.error) throw exceptionsResult.error;
  return { patterns: patternsResult.data || [], exceptions: exceptionsResult.data || [] };
}

export function availabilityConflictsForRows({ rows = [], patterns = [], exceptions = [] } = {}) {
  return rows.flatMap((row) => {
    const availability = evaluateScheduleAvailability({ staffId: row.staff_id, shiftDate: row.shift_date, startTime: row.start_time, endTime: row.end_time, patterns, exceptions });
    return availability.conflict ? [{ ...row, availability }] : [];
  });
}

export async function loadStaffAvailability({ organizationId, staffId } = {}) {
  if (!organizationId || !staffId) throw new Error("organizationId and staffId required");
  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const today = localDateString(new Date(), timeContext.timezone);
  const [patternsResult, exceptionsResult, scheduleResult] = await Promise.all([
    supabaseAdmin.from("staff_availability_patterns").select("*").eq("organization_id", organizationId).eq("staff_id", staffId).order("effective_from", { ascending: false }).order("weekday", { ascending: true }),
    supabaseAdmin.from("staff_availability_exceptions").select("*").eq("organization_id", organizationId).eq("staff_id", staffId).gte("exception_date", today).order("exception_date", { ascending: true }),
    supabaseAdmin.from("staff_schedules").select("id,staff_id,shift_date,start_time,end_time,status,availability_override_reason").eq("organization_id", organizationId).eq("staff_id", staffId).eq("status", "PUBLISHED").gte("shift_date", today).order("shift_date", { ascending: true }).limit(120),
  ]);
  if (patternsResult.error) throw patternsResult.error;
  if (exceptionsResult.error) throw exceptionsResult.error;
  if (scheduleResult.error) throw scheduleResult.error;
  const patterns = patternsResult.data || [];
  const exceptions = exceptionsResult.data || [];
  return {
    timezone: timeContext.timezone,
    today,
    patterns,
    exceptions,
    upcomingSchedules: (scheduleResult.data || []).map((row) => ({ ...row, availability: evaluateScheduleAvailability({ staffId, shiftDate: row.shift_date, startTime: row.start_time, endTime: row.end_time, patterns, exceptions }) })),
  };
}

export async function replaceStaffAvailabilityPattern({ organizationId, staff, effectiveFrom, rules } = {}) {
  if (!staff?.id) throw new Error("staff required");
  const effective = cleanDate(effectiveFrom, "effectiveFrom");
  const normalizedRules = (Array.isArray(rules) ? rules : []).map((rule) => {
    const weekday = Number(rule?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("weekday must be between 0 and 6");
    const startTime = cleanTime(rule?.startTime ?? rule?.start_time, "startTime");
    const endTime = cleanTime(rule?.endTime ?? rule?.end_time, "endTime");
    if (Boolean(startTime) !== Boolean(endTime)) throw new Error("Availability start and end times must be supplied together");
    return { weekday, availabilityType: cleanType(rule?.availabilityType ?? rule?.availability_type), startTime, endTime, notes: cleanNotes(rule?.notes) };
  });
  const { data, error } = await supabaseAdmin.rpc("replace_staff_availability_pattern", { p_organization_id: organizationId, p_staff_id: staff.id, p_effective_from: effective, p_rules: normalizedRules, p_actor_staff_id: staff.id });
  if (error) throw error;
  return data;
}

export async function createAvailabilityException({ organizationId, staff, exceptionDate, availabilityType, startTime, endTime, notes } = {}) {
  if (!staff?.id) throw new Error("staff required");
  const start = cleanTime(startTime, "startTime");
  const end = cleanTime(endTime, "endTime");
  if (Boolean(start) !== Boolean(end)) throw new Error("Availability start and end times must be supplied together");
  const { data, error } = await supabaseAdmin.from("staff_availability_exceptions").insert({ organization_id: organizationId, staff_id: staff.id, party_id: staff.party_id || null, exception_date: cleanDate(exceptionDate, "exceptionDate"), availability_type: cleanType(availabilityType), start_time: start, end_time: end, notes: cleanNotes(notes), status: "ACTIVE", created_by_staff_id: staff.id }).select("*").single();
  if (error) {
    if (error.code === "23505") { const duplicate = new Error("This availability exception already exists"); duplicate.status = 409; duplicate.code = "AVAILABILITY_EXCEPTION_EXISTS"; throw duplicate; }
    throw error;
  }
  return data;
}

export async function cancelAvailabilityException({ organizationId, staffId, exceptionId } = {}) {
  const { data, error } = await supabaseAdmin.from("staff_availability_exceptions").update({ status: "CANCELLED" }).eq("id", exceptionId).eq("organization_id", organizationId).eq("staff_id", staffId).eq("status", "ACTIVE").select("*").maybeSingle();
  if (error) throw error;
  if (!data) { const missing = new Error("Active availability exception not found"); missing.status = 404; missing.code = "AVAILABILITY_EXCEPTION_NOT_FOUND"; throw missing; }
  return data;
}
