import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function validTimezone(value) {
  const timezone = clean(value);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

function cutoffMinutes(property) {
  const raw = property?.business_day_cutoff_minutes ?? property?.business_day_start_minutes ?? 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(12 * 60, Math.trunc(parsed)));
}

function localParts(at, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function previousCalendarDate({ year, month, day }) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function deriveHotelOperationalDate(property, at = new Date()) {
  const configuredTimezone = validTimezone(property?.time_zone || property?.timezone);
  const timezone = configuredTimezone || "UTC";
  const cutoff = cutoffMinutes(property);
  const parts = localParts(at, timezone);
  const wallClockMinutes = parts.hour * 60 + parts.minute;
  const calendarDate = isoDate(parts.year, parts.month, parts.day);
  const businessDate = wallClockMinutes < cutoff ? previousCalendarDate(parts) : calendarDate;

  return Object.freeze({
    businessDate,
    propertyDate: calendarDate,
    timezone,
    cutoffMinutes: cutoff,
    configured: Boolean(configuredTimezone),
    compatibilityFallback: !configuredTimezone,
  });
}

export async function getHotelOperationalDate({ organizationId, propertyId, at = new Date() } = {}) {
  const organization = clean(organizationId);
  const property = clean(propertyId);
  if (!organization) throw new Error("organizationId required for Hotel operational date");
  if (!property) throw new Error("propertyId required for Hotel operational date");

  const { data, error } = await supabaseAdmin
    .from("hotel_properties")
    .select("*")
    .eq("organization_id", organization)
    .eq("id", property)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Hotel property not found");

  return Object.freeze({
    property: data,
    ...deriveHotelOperationalDate(data, at),
  });
}

export default getHotelOperationalDate;
