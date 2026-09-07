import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { broadcastHotelReadinessChanged } from "@/lib/hotel/server/broadcastHotelReadinessChanged";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

async function resolveSession(token) {
  if (!token || token.length < 32) return { error: "Invalid arrival link", status: 404 };
  const { data: session, error } = await supabaseAdmin.from("hotel_pre_arrival_sessions").select("*").eq("token_hash", tokenHash(token)).eq("status", "OPEN").maybeSingle();
  if (error) throw error;
  if (!session) return { error: "Arrival link is invalid or no longer active", status: 404 };
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin.from("hotel_pre_arrival_sessions").update({ status: "EXPIRED" }).eq("id", session.id).eq("status", "OPEN");
    return { error: "Arrival link has expired", status: 410 };
  }
  return { session };
}

export async function GET(request) {
  try {
    const token = clean(request.nextUrl.searchParams.get("token"));
    const resolved = await resolveSession(token);
    if (resolved.error) return fail(resolved.error, resolved.status);
    const session = resolved.session;

    const { data: booking, error: bookingError } = await supabaseAdmin.from("hotel_bookings").select("id,organization_id,property_id,guest_id,check_in_date,check_out_date,estimated_arrival_at,registration_status,mobile_arrival_status").eq("organization_id", session.organization_id).eq("id", session.booking_id).maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return fail("Stay not found", 404);

    const [{ data: guest, error: guestError }, { data: property, error: propertyError }] = await Promise.all([
      supabaseAdmin.from("hotel_guests").select("full_name,email,phone,preferred_language,preferences").eq("organization_id", session.organization_id).eq("id", booking.guest_id).maybeSingle(),
      booking.property_id ? supabaseAdmin.from("hotel_properties").select("name,address,city,country").eq("organization_id", session.organization_id).eq("id", booking.property_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (guestError) throw guestError;
    if (propertyError) throw propertyError;

    return NextResponse.json({ success: true, stay: { checkInDate: booking.check_in_date, checkOutDate: booking.check_out_date, estimatedArrivalAt: booking.estimated_arrival_at, registrationStatus: booking.registration_status, mobileArrivalStatus: booking.mobile_arrival_status }, guest: guest || {}, property: property || {}, expiresAt: session.expires_at });
  } catch (error) {
    console.error("HOTEL_PUBLIC_PREARRIVAL_LOAD_ERROR", error);
    return fail("Unable to load arrival registration", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = clean(body.token);
    const resolved = await resolveSession(token);
    if (resolved.error) return fail(resolved.error, resolved.status);
    const session = resolved.session;

    const fullName = clean(body.fullName);
    const email = clean(body.email);
    const phone = clean(body.phone);
    const preferredLanguage = clean(body.preferredLanguage);
    const estimatedArrivalAt = clean(body.estimatedArrivalAt) || null;
    if (!fullName) return fail("Guest name required");
    if (!body.registrationConsent) return fail("Registration consent required");

    const { data: completion, error: completionError } = await supabaseAdmin.rpc("hotel_complete_pre_arrival_guarded", {
      p_session_id: session.id,
      p_full_name: fullName,
      p_email: email || null,
      p_phone: phone || null,
      p_preferred_language: preferredLanguage || null,
      p_estimated_arrival_at: estimatedArrivalAt,
      p_marketing_consent: Boolean(body.marketingConsent),
    });
    if (completionError) throw completionError;

    const row = Array.isArray(completion) ? completion[0] : completion;

    await broadcastHotelReadinessChanged({
      organizationId: row?.organization_id || session.organization_id,
      source: "pre-arrival-public",
      action: "PRE_ARRIVAL_COMPLETED",
    });

    return NextResponse.json({ success: true, status: row?.status || "READY_FOR_FRONT_DESK", completion: row || null });
  } catch (error) {
    console.error("HOTEL_PUBLIC_PREARRIVAL_COMPLETE_ERROR", error);
    const message = clean(error?.message);
    const conflict = /PREARRIVAL_(SESSION|BOOKING|GUEST)|BUSINESS_DAY_CLOSED/.test(message);
    return fail(conflict ? message : "Unable to complete arrival registration", conflict ? 409 : 500);
  }
}
