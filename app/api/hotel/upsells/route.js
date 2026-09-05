import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");
    const { data, error } = await supabaseAdmin.from("hotel_upsell_offers").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("active", { ascending: false }).order("name");
    if (error) throw error;
    return NextResponse.json({ success: true, offers: data || [] });
  } catch (error) {
    console.error("HOTEL_UPSELL_LIST_ERROR", error);
    return fail(error?.message || "Unable to load upsells", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId);
    const propertyId = clean(body.propertyId);
    const action = clean(body.action || "CREATE").toUpperCase();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);

    if (action === "CREATE") {
      const name = clean(body.name);
      const code = clean(body.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
      const price = Number(body.price || 0);
      if (!propertyId || !name || !code || !Number.isFinite(price) || price < 0) return fail("Property, offer name and valid price required");
      const { data, error } = await supabaseAdmin.from("hotel_upsell_offers").upsert({ organization_id: access.organizationId, property_id: propertyId, code, name, description: clean(body.description) || null, price, currency_code: clean(body.currencyCode || "THB").toUpperCase(), active: true, updated_at: new Date().toISOString() }, { onConflict: "organization_id,property_id,code" }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, offer: data });
    }

    if (action === "ACCEPT") {
      const bookingId = clean(body.bookingId);
      const offerId = clean(body.offerId);
      const quantity = Math.max(1, Number.parseInt(body.quantity || 1, 10));
      const [{ data: booking, error: bookingError }, { data: offer, error: offerError }] = await Promise.all([
        supabaseAdmin.from("hotel_bookings").select("id,property_id,currency_code").eq("organization_id", access.organizationId).eq("id", bookingId).maybeSingle(),
        supabaseAdmin.from("hotel_upsell_offers").select("*").eq("organization_id", access.organizationId).eq("id", offerId).eq("active", true).maybeSingle(),
      ]);
      if (bookingError) throw bookingError;
      if (offerError) throw offerError;
      if (!booking || !offer || booking.property_id !== offer.property_id) return fail("Booking and offer do not belong to the same property", 409);
      const { data, error } = await supabaseAdmin.from("hotel_booking_upsells").upsert({ organization_id: access.organizationId, booking_id: booking.id, offer_id: offer.id, quantity, unit_price: offer.price, status: "ACCEPTED" }, { onConflict: "organization_id,booking_id,offer_id" }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, bookingUpsell: data });
    }

    return fail("Unsupported upsell action");
  } catch (error) {
    console.error("HOTEL_UPSELL_ACTION_ERROR", error);
    return fail(error?.message || "Unable to update upsell", 500);
  }
}
