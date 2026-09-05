import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400, details = undefined) => NextResponse.json({ success: false, error, ...(details ? { details } : {}) }, { status });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function buildPreflight(organizationId, propertyId, businessDate) {
  const [{ data: bookings, error: bookingsError }, { data: folios, error: foliosError }, { data: syncJobs, error: syncError }] = await Promise.all([
    supabaseAdmin.from("hotel_bookings").select("id,status,check_in_date,check_out_date,guest_id,room_id,total_amount,paid_amount,payment_status").eq("organization_id", organizationId).eq("property_id", propertyId),
    supabaseAdmin.from("hotel_folios").select("id,booking_id,status").eq("organization_id", organizationId).eq("property_id", propertyId),
    supabaseAdmin.from("hotel_channel_sync_jobs").select("id,status,last_error,created_at").eq("organization_id", organizationId).eq("property_id", propertyId).in("status", ["FAILED", "RETRY_REQUIRED"]),
  ]);
  if (bookingsError) throw bookingsError;
  if (foliosError) throw foliosError;
  if (syncError) throw syncError;

  const overdueArrivals = (bookings || []).filter((booking) => booking.status === "RESERVED" && booking.check_in_date <= businessDate);
  const overdueDepartures = (bookings || []).filter((booking) => booking.status === "CHECKED_IN" && booking.check_out_date <= businessDate);
  const checkedOutIds = new Set((bookings || []).filter((booking) => booking.status === "CHECKED_OUT" && booking.check_out_date <= businessDate).map((booking) => booking.id));
  const openDepartureFolios = (folios || []).filter((folio) => folio.status === "OPEN" && checkedOutIds.has(folio.booking_id));

  const blockers = [
    ...overdueArrivals.map((booking) => ({ type: "ARRIVAL_NOT_RESOLVED", bookingId: booking.id, label: `Arrival ${booking.id.slice(0, 8)} is still reserved`, date: booking.check_in_date })),
    ...overdueDepartures.map((booking) => ({ type: "DEPARTURE_NOT_RESOLVED", bookingId: booking.id, label: `Departure ${booking.id.slice(0, 8)} is still checked in`, date: booking.check_out_date })),
    ...openDepartureFolios.map((folio) => ({ type: "OPEN_DEPARTURE_FOLIO", bookingId: folio.booking_id, folioId: folio.id, label: `Checked-out stay ${folio.booking_id.slice(0, 8)} still has an open folio` })),
  ];
  const warnings = (syncJobs || []).map((job) => ({ type: "CHANNEL_SYNC_EXCEPTION", jobId: job.id, label: job.last_error || "Channel synchronization requires attention" }));

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
    },
  };
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const businessDate = clean(request.nextUrl.searchParams.get("businessDate")) || todayIso();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");

    const [preflight, auditResult] = await Promise.all([
      buildPreflight(access.organizationId, propertyId, businessDate),
      supabaseAdmin.from("hotel_night_audits").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("business_date", businessDate).maybeSingle(),
    ]);
    if (auditResult.error) throw auditResult.error;
    return NextResponse.json({ success: true, preflight, audit: auditResult.data || null });
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
    const businessDate = clean(body.businessDate) || todayIso();
    const action = clean(body.action || "CLOSE").toUpperCase();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");
    if (action !== "CLOSE") return fail("Unsupported night audit action");

    const preflight = await buildPreflight(access.organizationId, propertyId, businessDate);
    if (!preflight.ready) return fail("Night audit is blocked until operating exceptions are resolved", 409, preflight);

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from("hotel_night_audits").upsert({
      organization_id: access.organizationId,
      property_id: propertyId,
      business_date: businessDate,
      status: "CLOSED",
      control_summary: preflight,
      closed_at: now,
      updated_at: now,
    }, { onConflict: "organization_id,property_id,business_date" }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, audit: data, preflight });
  } catch (error) {
    console.error("HOTEL_NIGHT_AUDIT_CLOSE_ERROR", error);
    return fail(error?.message || "Unable to close night audit", 500);
  }
}
