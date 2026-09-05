import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

async function authorize(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: fail(access.error, access.status) };
  return { organizationId: access.organizationId };
}

async function getBooking(organizationId, bookingId) {
  const { data, error } = await supabaseAdmin
    .from("hotel_bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id"));
    const bookingId = clean(request.nextUrl.searchParams.get("bookingId") || request.nextUrl.searchParams.get("booking_id"));
    const auth = await authorize(request, organizationId);
    if (auth.error) return auth.error;

    let bookingsQuery = supabaseAdmin.from("hotel_bookings").select("*").eq("organization_id", auth.organizationId).order("check_in_date", { ascending: true });
    if (propertyId) bookingsQuery = bookingsQuery.eq("property_id", propertyId);
    if (bookingId) bookingsQuery = bookingsQuery.eq("id", bookingId);

    const [{ data: bookings, error: bookingsError }, { data: guests, error: guestsError }, { data: rooms, error: roomsError }] = await Promise.all([
      bookingsQuery,
      supabaseAdmin.from("hotel_guests").select("*").eq("organization_id", auth.organizationId).order("full_name"),
      propertyId
        ? supabaseAdmin.from("hotel_rooms").select("*").eq("organization_id", auth.organizationId).eq("property_id", propertyId).order("room_number")
        : supabaseAdmin.from("hotel_rooms").select("*").eq("organization_id", auth.organizationId).order("room_number"),
    ]);
    if (bookingsError) throw bookingsError;
    if (guestsError) throw guestsError;
    if (roomsError) throw roomsError;

    const bookingIds = (bookings || []).map((booking) => booking.id);
    let folios = [];
    let folioLines = [];
    let roomMoves = [];
    let bookingUpsells = [];
    if (bookingIds.length) {
      const [foliosResult, movesResult, upsellsResult] = await Promise.all([
        supabaseAdmin.from("hotel_folios").select("*").eq("organization_id", auth.organizationId).in("booking_id", bookingIds),
        supabaseAdmin.from("hotel_room_moves").select("*").eq("organization_id", auth.organizationId).in("booking_id", bookingIds).order("moved_at", { ascending: false }),
        supabaseAdmin.from("hotel_booking_upsells").select("*").eq("organization_id", auth.organizationId).in("booking_id", bookingIds),
      ]);
      if (foliosResult.error) throw foliosResult.error;
      if (movesResult.error) throw movesResult.error;
      if (upsellsResult.error) throw upsellsResult.error;
      folios = foliosResult.data || [];
      roomMoves = movesResult.data || [];
      bookingUpsells = upsellsResult.data || [];
      const folioIds = folios.map((folio) => folio.id);
      if (folioIds.length) {
        const linesResult = await supabaseAdmin.from("hotel_folio_lines").select("*").eq("organization_id", auth.organizationId).in("folio_id", folioIds).order("created_at", { ascending: false });
        if (linesResult.error) throw linesResult.error;
        folioLines = linesResult.data || [];
      }
    }

    let offers = [];
    if (propertyId) {
      const result = await supabaseAdmin.from("hotel_upsell_offers").select("*").eq("organization_id", auth.organizationId).eq("property_id", propertyId).eq("active", true).order("name");
      if (result.error) throw result.error;
      offers = result.data || [];
    }

    return NextResponse.json({ success: true, bookings: bookings || [], guests: guests || [], rooms: rooms || [], folios, folioLines, roomMoves, offers, bookingUpsells });
  } catch (error) {
    console.error("HOTEL_STAY_CONTROL_LIST_ERROR", error);
    return fail(error?.message || "Unable to load stay control", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const action = clean(body.action).toUpperCase();
    const bookingId = clean(body.bookingId || body.booking_id);
    const auth = await authorize(request, organizationId);
    if (auth.error) return auth.error;
    if (!bookingId) return fail("bookingId required");

    const booking = await getBooking(auth.organizationId, bookingId);
    if (!booking) return fail("Booking not found", 404);

    if (action === "UPDATE_GUEST") {
      if (!booking.guest_id) return fail("Booking has no guest profile");
      const patch = {
        preferred_language: clean(body.preferredLanguage || body.preferred_language) || null,
        vip_status: clean(body.vipStatus || body.vip_status || "STANDARD").toUpperCase(),
        preferences: typeof body.preferences === "object" && body.preferences ? body.preferences : {},
        marketing_consent: Boolean(body.marketingConsent ?? body.marketing_consent),
      };
      const { data, error } = await supabaseAdmin.from("hotel_guests").update(patch).eq("organization_id", auth.organizationId).eq("id", booking.guest_id).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, guest: data });
    }

    if (action === "ASSIGN_ROOM" || action === "MOVE_ROOM") {
      const toRoomId = clean(body.roomId || body.toRoomId || body.to_room_id);
      if (!toRoomId) return fail("Target room required");
      const { data: target, error: targetError } = await supabaseAdmin.from("hotel_rooms").select("*").eq("organization_id", auth.organizationId).eq("id", toRoomId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return fail("Target room not found", 404);
      if (booking.property_id && target.property_id !== booking.property_id) return fail("Target room belongs to another property", 409);
      if (target.status !== "AVAILABLE") return fail(`Room ${target.room_number || ""} is ${target.status}; only AVAILABLE rooms can be assigned`, 409);
      if (booking.room_id === target.id) return NextResponse.json({ success: true, booking, unchanged: true });

      const previousRoomId = booking.room_id || null;
      if (booking.status === "CHECKED_IN") {
        const now = new Date().toISOString();
        const { data: acquired, error: acquireError } = await supabaseAdmin.from("hotel_rooms").update({ status: "OCCUPIED", updated_at: now }).eq("organization_id", auth.organizationId).eq("id", target.id).eq("status", "AVAILABLE").select("id").maybeSingle();
        if (acquireError) throw acquireError;
        if (!acquired) return fail("Target room readiness changed. Refresh and choose another room.", 409);

        const { data: movedBooking, error: bookingError } = await supabaseAdmin.from("hotel_bookings").update({ room_id: target.id, property_id: target.property_id || booking.property_id, updated_at: now }).eq("organization_id", auth.organizationId).eq("id", booking.id).eq("room_id", previousRoomId).select().maybeSingle();
        if (bookingError || !movedBooking) {
          await supabaseAdmin.from("hotel_rooms").update({ status: "AVAILABLE" }).eq("organization_id", auth.organizationId).eq("id", target.id).eq("status", "OCCUPIED");
          if (bookingError) throw bookingError;
          return fail("Booking changed while moving rooms. Refresh and retry.", 409);
        }
        if (previousRoomId) {
          await supabaseAdmin.from("hotel_rooms").update({ status: "DIRTY", updated_at: now }).eq("organization_id", auth.organizationId).eq("id", previousRoomId).eq("status", "OCCUPIED");
          const { error: housekeepingError } = await supabaseAdmin.from("hotel_housekeeping_tasks").insert({
            organization_id: auth.organizationId,
            room_id: previousRoomId,
            booking_id: booking.id,
            task_status: "PENDING",
            scheduled_at: now,
            created_at: now,
          });
          if (housekeepingError) throw housekeepingError;
        }
      } else {
        const { error } = await supabaseAdmin.from("hotel_bookings").update({ room_id: target.id, property_id: target.property_id || booking.property_id, updated_at: new Date().toISOString() }).eq("organization_id", auth.organizationId).eq("id", booking.id);
        if (error) throw error;
      }

      const { error: moveError } = await supabaseAdmin.from("hotel_room_moves").insert({ organization_id: auth.organizationId, booking_id: booking.id, from_room_id: previousRoomId, to_room_id: target.id, reason: clean(body.reason) || (previousRoomId ? "Room move" : "Room assignment") });
      if (moveError) throw moveError;
      return NextResponse.json({ success: true, roomId: target.id, roomNumber: target.room_number });
    }

    if (action === "ADD_FOLIO_LINE") {
      const lineType = clean(body.lineType || body.line_type).toUpperCase();
      const allowed = new Set(["CHARGE", "DEPOSIT_REFERENCE", "PAYMENT_REFERENCE", "ADJUSTMENT", "REFUND_REFERENCE"]);
      if (!allowed.has(lineType)) return fail("Unsupported folio line type");
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) return fail("Valid amount required");
      const description = clean(body.description);
      if (!description) return fail("Description required");
      if (lineType.includes("REFERENCE") && !clean(body.sourceId || body.source_id || body.financeReferenceId || body.finance_reference_id)) return fail("Payment/deposit/refund references require an external or Finance reference");

      const folioPayload = {
        organization_id: auth.organizationId,
        property_id: booking.property_id || null,
        booking_id: booking.id,
        guest_id: booking.guest_id || null,
        currency_code: booking.currency_code || "THB",
        status: "OPEN",
        updated_at: new Date().toISOString(),
      };
      const { data: folio, error: folioError } = await supabaseAdmin.from("hotel_folios").upsert(folioPayload, { onConflict: "organization_id,booking_id" }).select().single();
      if (folioError) throw folioError;
      const financeReferenceId = clean(body.financeReferenceId || body.finance_reference_id) || null;
      const { data: line, error: lineError } = await supabaseAdmin.from("hotel_folio_lines").insert({
        organization_id: auth.organizationId,
        folio_id: folio.id,
        line_type: lineType,
        description,
        amount,
        tax_amount: Number(body.taxAmount || body.tax_amount || 0),
        source_type: clean(body.sourceType || body.source_type) || null,
        source_id: clean(body.sourceId || body.source_id) || null,
        finance_reference_id: financeReferenceId,
        metadata: {},
      }).select().single();
      if (lineError) throw lineError;
      return NextResponse.json({ success: true, folio, line });
    }

    if (action === "CREATE_PRE_ARRIVAL") {
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from("hotel_pre_arrival_sessions").update({ status: "REPLACED" }).eq("organization_id", auth.organizationId).eq("booking_id", booking.id).eq("status", "OPEN");
      const { data: session, error } = await supabaseAdmin.from("hotel_pre_arrival_sessions").insert({ organization_id: auth.organizationId, booking_id: booking.id, token_hash: tokenHash, status: "OPEN", expires_at: expiresAt }).select("id,status,expires_at").single();
      if (error) throw error;
      const { error: bookingError } = await supabaseAdmin.from("hotel_bookings").update({ pre_arrival_status: "INVITED", updated_at: new Date().toISOString() }).eq("organization_id", auth.organizationId).eq("id", booking.id);
      if (bookingError) throw bookingError;
      return NextResponse.json({ success: true, session, token: rawToken });
    }

    return fail("Unsupported stay action");
  } catch (error) {
    console.error("HOTEL_STAY_CONTROL_ACTION_ERROR", error);
    return fail(error?.message || "Unable to update stay", 500);
  }
}
