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
      const { data: property, error: propertyError } = await supabaseAdmin.from("hotel_properties").select("id").eq("organization_id", access.organizationId).eq("id", propertyId).maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) return fail("Property not found", 404);
      const { data, error } = await supabaseAdmin.from("hotel_upsell_offers").upsert({
        organization_id: access.organizationId,
        property_id: propertyId,
        code,
        name,
        description: clean(body.description) || null,
        price,
        currency_code: clean(body.currencyCode || "THB").toUpperCase(),
        active: body.active === false ? false : true,
        inventory_policy: typeof body.inventoryPolicy === "object" && body.inventoryPolicy ? body.inventoryPolicy : {},
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,property_id,code" }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, offer: data });
    }

    if (action === "SET_ACTIVE") {
      const offerId = clean(body.offerId);
      if (!propertyId || !offerId) return fail("propertyId and offerId required");
      const { data, error } = await supabaseAdmin.from("hotel_upsell_offers").update({ active: Boolean(body.active), updated_at: new Date().toISOString() }).eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("id", offerId).select().maybeSingle();
      if (error) throw error;
      if (!data) return fail("Offer not found", 404);
      return NextResponse.json({ success: true, offer: data });
    }

    if (action === "ACCEPT") {
      const bookingId = clean(body.bookingId);
      const offerId = clean(body.offerId);
      const quantity = Math.max(1, Number.parseInt(body.quantity || 1, 10));
      if (!bookingId || !offerId) return fail("bookingId and offerId required");

      const [{ data: booking, error: bookingError }, { data: offer, error: offerError }] = await Promise.all([
        supabaseAdmin.from("hotel_bookings").select("id,property_id,guest_id,currency_code,status").eq("organization_id", access.organizationId).eq("id", bookingId).maybeSingle(),
        supabaseAdmin.from("hotel_upsell_offers").select("*").eq("organization_id", access.organizationId).eq("id", offerId).eq("active", true).maybeSingle(),
      ]);
      if (bookingError) throw bookingError;
      if (offerError) throw offerError;
      if (!booking || !offer || booking.property_id !== offer.property_id) return fail("Booking and offer do not belong to the same property", 409);
      if (["CHECKED_OUT", "CANCELLED"].includes(String(booking.status || "").toUpperCase())) return fail("Closed or cancelled stays cannot accept new offers", 409);

      const { data: existingFolio, error: existingFolioError } = await supabaseAdmin.from("hotel_folios").select("*").eq("organization_id", access.organizationId).eq("booking_id", booking.id).maybeSingle();
      if (existingFolioError) throw existingFolioError;
      if (existingFolio?.status === "CLOSED") return fail("The guest folio is closed; controlled reversal is required before adding another stay charge", 409);

      const { data: bookingUpsell, error: upsellError } = await supabaseAdmin.from("hotel_booking_upsells").upsert({
        organization_id: access.organizationId,
        booking_id: booking.id,
        offer_id: offer.id,
        quantity,
        unit_price: offer.price,
        status: "ACCEPTED",
      }, { onConflict: "organization_id,booking_id,offer_id" }).select().single();
      if (upsellError) throw upsellError;

      const { data: folio, error: folioError } = await supabaseAdmin.from("hotel_folios").upsert({
        organization_id: access.organizationId,
        property_id: booking.property_id,
        booking_id: booking.id,
        guest_id: booking.guest_id || null,
        currency_code: booking.currency_code || offer.currency_code || "THB",
        status: "OPEN",
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,booking_id" }).select().single();
      if (folioError) throw folioError;

      const expectedAmount = Number(offer.price || 0) * quantity;
      const { data: existingLine, error: lineReadError } = await supabaseAdmin.from("hotel_folio_lines").select("id,amount").eq("organization_id", access.organizationId).eq("folio_id", folio.id).eq("source_type", "HOTEL_UPSELL").eq("source_id", bookingUpsell.id).is("voided_at", null).maybeSingle();
      if (lineReadError) throw lineReadError;
      if (!existingLine) {
        const { error: lineError } = await supabaseAdmin.from("hotel_folio_lines").insert({
          organization_id: access.organizationId,
          folio_id: folio.id,
          line_type: "CHARGE",
          description: `${offer.name} × ${quantity}`,
          amount: expectedAmount,
          tax_amount: 0,
          source_type: "HOTEL_UPSELL",
          source_id: bookingUpsell.id,
          metadata: { offer_id: offer.id, offer_code: offer.code, quantity, unit_price: offer.price },
        });
        if (lineError) throw lineError;
      } else if (Math.abs(Number(existingLine.amount || 0) - expectedAmount) > 0.005) {
        return fail("Upsell already has a different folio amount. Resolve the existing hotel charge before changing quantity.", 409);
      }

      return NextResponse.json({ success: true, bookingUpsell, folioCharge: expectedAmount, repairedFolioLine: !existingLine });
    }

    return fail("Unsupported upsell action");
  } catch (error) {
    console.error("HOTEL_UPSELL_ACTION_ERROR", error);
    return fail(error?.message || "Unable to update upsell", 500);
  }
}
