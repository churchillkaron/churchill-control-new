import { NextResponse } from "next/server";

import { deriveHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function clean(value) {
  return String(value ?? "").trim();
}

function fail(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
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

function parseCutoff(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 720) return null;
  return number;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const propertyId = clean(body.propertyId || body.property_id);
    const timeZone = validTimezone(body.timeZone || body.time_zone);
    const cutoffMinutes = parseCutoff(body.cutoffMinutes ?? body.business_day_cutoff_minutes);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");
    if (!timeZone) return fail("A valid IANA property timezone is required");
    if (cutoffMinutes === null) return fail("cutoffMinutes must be a whole number from 0 to 720");

    const changedAt = new Date().toISOString();
    const { data: property, error } = await supabaseAdmin
      .from("hotel_properties")
      .update({
        time_zone: timeZone,
        business_day_cutoff_minutes: cutoffMinutes,
        operational_day_configured_at: changedAt,
        updated_at: changedAt,
      })
      .eq("organization_id", access.organizationId)
      .eq("id", propertyId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!property) return fail("Hotel property not found", 404);

    return NextResponse.json({
      success: true,
      property,
      operationalDate: deriveHotelOperationalDate(property),
    });
  } catch (error) {
    console.error("HOTEL_OPERATIONAL_DAY_SETTINGS_ERROR", error);
    return fail(error?.message || "Unable to save Hotel operational day", 500);
  }
}
