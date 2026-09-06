import { NextResponse } from "next/server";

import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400, details = undefined) => NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status });

function guestName(booking) {
  return booking?.hotel_guests?.full_name || "Guest";
}

function roomLabel(booking) {
  return booking?.hotel_rooms?.room_number ? `Room ${booking.hotel_rooms.room_number}` : "Room unassigned";
}

function operationalDayBlocker(operationalDate) {
  if (!operationalDate?.compatibilityFallback) return [];
  return [{
    type: "OPERATIONAL_DAY_UNCONFIGURED",
    label: "Property operational day is not configured",
    detail: "Set the property timezone and day cutoff before closing a hotel business day. Avantiqo will not certify a UTC fallback as the property's operating date.",
    resolution: { route: "operational-day", label: "Configure operational day" },
  }];
}

async function buildPreflight(organizationId, propertyId, operationalDate) {
  const businessDate = operationalDate.businessDate;
  const [{ data: bookings, error: bookingsError }, { data: folios, error: foliosError }, { data: syncJobs, error: syncError }] = await Promise.all([
    supabaseAdmin.from("hotel_bookings").select("id,status,check_in_date,check_out_date,guest_id,room_id,total_amount,paid_amount,payment_status,hotel_guests(full_name),hotel_rooms(room_number)").eq("organization_id", organizationId).eq("property_id", propertyId),
    supabaseAdmin.from("hotel_folios").select("id,booking_id,status").eq("organization_id", organizationId).eq("property_id", propertyId),
    supabaseAdmin.from("hotel_channel_sync_jobs").select("id,status,last_error,created_at").eq("organization_id", organizationId).eq("property_id", propertyId).in("status", ["FAILED", "RETRY_REQUIRED"]),
  ]);
  if (bookingsError) throw bookingsError;
  if (foliosError) throw foliosError;
  if (syncError) throw syncError;

  const bookingById = new Map((bookings || []).map((booking) => [booking.id, booking]));
  const overdueArrivals = (bookings || []).filter((booking) => booking.status === "RESERVED" && booking.check_in_date <= businessDate);
  const overdueDepartures = (bookings || []).filter((booking) => booking.status === "CHECKED_IN" && booking.check_out_date <= businessDate);
  const checkedOutIds = new Set((bookings || []).filter((booking) => booking.status === "CHECKED_OUT" && booking.check_out_date <= businessDate).map((booking) => booking.id));
  const openDepartureFolios = (folios || []).filter((folio) => folio.status === "OPEN" && checkedOutIds.has(folio.booking_id));

  const blockers = [
    ...operationalDayBlocker(operationalDate),
    ...overdueArrivals.map((booking) => ({
      type: "ARRIVAL_NOT_RESOLVED",
      bookingId: booking.id,
      label: `${guestName(booking)} has not arrived or been resolved`,
      detail: `${roomLabel(booking)} · Arrival ${booking.check_in_date}. Check the guest in, keep the reservation valid, or record the no-show when eligible.`,
      resolution: { route: "front-desk", label: "Resolve arrival" },
    })),
    ...overdueDepartures.map((booking) => ({
      type: "DEPARTURE_NOT_RESOLVED",
      bookingId: booking.id,
      label: `${guestName(booking)} is still in house`,
      detail: `${roomLabel(booking)} · Scheduled departure ${booking.check_out_date}. Settle and check out, or extend the stay before the day can close.`,
      resolution: { route: "front-desk", label: "Resolve departure" },
    })),
    ...openDepartureFolios.map((folio) => {
      const booking = bookingById.get(folio.booking_id);
      return {
        type: "OPEN_DEPARTURE_FOLIO",
        bookingId: folio.booking_id,
        folioId: folio.id,
        label: `${guestName(booking)} checked out with an open folio`,
        detail: `${roomLabel(booking)} · The physical departure is recorded, but the guest account is not financially closed.`,
        resolution: { route: "stay-control", label: "Close folio" },
      };
    }),
  ];
  const warnings = (syncJobs || []).map((job) => ({
    type: "CHANNEL_SYNC_EXCEPTION",
    jobId: job.id,
    label: "Channel synchronization needs attention",
    detail: job.last_error || "An OTA/channel synchronization job requires review.",
    resolution: { route: "channel-reservations", label: "Review channel" },
  }));

  return {
    businessDate,
    ready: blockers.length === 0,
    blockers,
    warnings,
    counts: {
      bookings: (bookings || []).length,
      overdueArrivals: overdueArrivals.length,
      overdueDepartures: overdueDepartures.length,
      openDepartureFolios: openDepartureFolios.length,
      channelWarnings: warnings.length,
      configurationBlockers: operationalDate.compatibilityFallback ? 1 : 0,
    },
  };
}

function publicOperationalDate(operationalDate) {
  return {
    businessDate: operationalDate.businessDate,
    propertyDate: operationalDate.propertyDate,
    timezone: operationalDate.timezone,
    cutoffMinutes: operationalDate.cutoffMinutes,
    configured: operationalDate.configured,
    compatibilityFallback: operationalDate.compatibilityFallback,
  };
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");

    const operationalDate = await getHotelOperationalDate({ organizationId: access.organizationId, propertyId });
    const [preflight, auditResult] = await Promise.all([
      buildPreflight(access.organizationId, propertyId, operationalDate),
      supabaseAdmin.from("hotel_night_audits").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("business_date", operationalDate.businessDate).maybeSingle(),
    ]);
    if (auditResult.error) throw auditResult.error;
    return NextResponse.json({ success: true, operationalDate: publicOperationalDate(operationalDate), preflight, audit: auditResult.data || null });
  } catch (error) {
    console.error("HOTEL_NIGHT_AUDIT_PREFLIGHT_ERROR", error);
    return fail(error?.message || "Unable to run night audit preflight", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId);
    const propertyId = clean(body.propertyId);
    const action = clean(body.action || "CLOSE").toUpperCase();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");
    if (action !== "CLOSE") return fail("Unsupported night audit action");

    const operationalDate = await getHotelOperationalDate({ organizationId: access.organizationId, propertyId });
    const preflight = await buildPreflight(access.organizationId, propertyId, operationalDate);
    if (!preflight.ready) return fail("Business day cannot close until the remaining work is resolved", 409, preflight);

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from("hotel_night_audits").upsert({
      organization_id: access.organizationId,
      property_id: propertyId,
      business_date: operationalDate.businessDate,
      status: "CLOSED",
      control_summary: { ...preflight, operationalDate: publicOperationalDate(operationalDate) },
      closed_at: now,
      updated_at: now,
    }, { onConflict: "organization_id,property_id,business_date" }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, audit: data, preflight, operationalDate: publicOperationalDate(operationalDate) });
  } catch (error) {
    console.error("HOTEL_NIGHT_AUDIT_CLOSE_ERROR", error);
    return fail(error?.message || "Unable to close night audit", 500);
  }
}
