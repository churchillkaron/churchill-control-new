import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DAY_TYPES = new Set(["PUBLIC_HOLIDAY", "ORGANIZATION_CLOSURE", "WORKING_DAY_OVERRIDE"]);

function cleanDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("calendarDate must use YYYY-MM-DD format");
  return text;
}

function cleanDayType(value) {
  const type = String(value || "").trim().toUpperCase();
  if (!DAY_TYPES.has(type)) throw new Error("Unsupported workforce calendar day type");
  return type;
}

function cleanText(value, field, max) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} required`);
  if (text.length > max) throw new Error(`${field} is too long`);
  return text;
}

export async function loadWorkforceCalendar({ organizationId, entityId, startDate, endDate, includeCancelled = false } = {}) {
  if (!organizationId || !entityId) throw new Error("organizationId and entityId required");
  let query = supabaseAdmin
    .from("workforce_calendar_days")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .gte("calendar_date", cleanDate(startDate))
    .lte("calendar_date", cleanDate(endDate))
    .order("calendar_date", { ascending: true });
  if (!includeCancelled) query = query.eq("status", "ACTIVE");
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createWorkforceCalendarDay({ organizationId, entityId, staff, calendarDate, dayType, name, notes = null, sourceType = "MANUAL", sourceReference = null } = {}) {
  if (!staff?.id) throw new Error("manager staff identity required");
  const { data, error } = await supabaseAdmin
    .from("workforce_calendar_days")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      calendar_date: cleanDate(calendarDate),
      day_type: cleanDayType(dayType),
      name: cleanText(name, "name", 160),
      notes: String(notes || "").trim() || null,
      source_type: String(sourceType || "MANUAL").trim().toUpperCase(),
      source_reference: String(sourceReference || "").trim() || null,
      status: "ACTIVE",
      created_by_staff_id: staff.id,
      created_by_party_id: staff.party_id || null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const conflict = new Error("An active workforce calendar day already exists for this entity/date/type");
      conflict.status = 409;
      conflict.code = "WORKFORCE_CALENDAR_DUPLICATE";
      throw conflict;
    }
    throw error;
  }
  return data;
}

export async function cancelWorkforceCalendarDay({ organizationId, entityId, staff, calendarDayId } = {}) {
  if (!staff?.id) throw new Error("manager staff identity required");
  const { data, error } = await supabaseAdmin
    .from("workforce_calendar_days")
    .update({
      status: "CANCELLED",
      cancelled_by_staff_id: staff.id,
      cancelled_by_party_id: staff.party_id || null,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", calendarDayId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("status", "ACTIVE")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const missing = new Error("Active workforce calendar day not found");
    missing.status = 404;
    missing.code = "WORKFORCE_CALENDAR_NOT_FOUND";
    throw missing;
  }
  return data;
}

export async function loadPublicHolidayMap({ organizationId, entityId, startDate, endDate } = {}) {
  const rows = await loadWorkforceCalendar({ organizationId, entityId, startDate, endDate });
  return new Map(
    rows
      .filter((row) => row.day_type === "PUBLIC_HOLIDAY")
      .map((row) => [row.calendar_date, row])
  );
}
