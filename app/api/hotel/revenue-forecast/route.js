import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

function iso(date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return iso(value);
}

function nightsBetween(from, to) {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const from = clean(request.nextUrl.searchParams.get("from")) || iso(new Date());
    const days = Math.min(90, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("days") || "30", 10)));
    const to = addDays(from, days);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");

    const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }] = await Promise.all([
      supabaseAdmin.from("hotel_rooms").select("id,status").eq("organization_id", access.organizationId).eq("property_id", propertyId),
      supabaseAdmin.from("hotel_bookings").select("id,status,check_in_date,check_out_date,total_amount,currency_code,source,channel_connection_id").eq("organization_id", access.organizationId).eq("property_id", propertyId).lt("check_in_date", to).gt("check_out_date", from).neq("status", "CANCELLED"),
    ]);
    if (roomsError) throw roomsError;
    if (bookingsError) throw bookingsError;

    const roomsAvailable = (rooms || []).filter((room) => !["OUT_OF_SERVICE", "BLOCKED"].includes(room.status)).length;
    const forecast = [];
    for (let offset = 0; offset < days; offset += 1) {
      const stayDate = addDays(from, offset);
      const active = (bookings || []).filter((booking) => booking.check_in_date <= stayDate && booking.check_out_date > stayDate);
      const roomsSold = active.length;
      const roomRevenue = active.reduce((sum, booking) => sum + Number(booking.total_amount || 0) / nightsBetween(booking.check_in_date, booking.check_out_date), 0);
      const occupancyPercent = roomsAvailable ? (roomsSold / roomsAvailable) * 100 : 0;
      const adr = roomsSold ? roomRevenue / roomsSold : 0;
      const revpar = roomsAvailable ? roomRevenue / roomsAvailable : 0;
      forecast.push({
        stayDate,
        roomsAvailable,
        roomsSold,
        occupancyPercent: Number(occupancyPercent.toFixed(2)),
        roomRevenue: Number(roomRevenue.toFixed(2)),
        adr: Number(adr.toFixed(2)),
        revpar: Number(revpar.toFixed(2)),
      });
    }

    const totals = {
      availableRoomNights: forecast.reduce((sum, row) => sum + row.roomsAvailable, 0),
      soldRoomNights: forecast.reduce((sum, row) => sum + row.roomsSold, 0),
      roomRevenue: Number(forecast.reduce((sum, row) => sum + row.roomRevenue, 0).toFixed(2)),
    };
    totals.occupancyPercent = totals.availableRoomNights ? Number(((totals.soldRoomNights / totals.availableRoomNights) * 100).toFixed(2)) : 0;
    totals.adr = totals.soldRoomNights ? Number((totals.roomRevenue / totals.soldRoomNights).toFixed(2)) : 0;
    totals.revpar = totals.availableRoomNights ? Number((totals.roomRevenue / totals.availableRoomNights).toFixed(2)) : 0;

    return NextResponse.json({ success: true, from, days, currencyCode: bookings?.[0]?.currency_code || "THB", forecast, totals });
  } catch (error) {
    console.error("HOTEL_REVENUE_FORECAST_ERROR", error);
    return fail(error?.message || "Unable to build hotel forecast", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId);
    const propertyId = clean(body.propertyId);
    const forecast = Array.isArray(body.forecast) ? body.forecast : [];
    const forecastDate = clean(body.forecastDate) || iso(new Date());
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId || !forecast.length || forecast.length > 90) return fail("Property and 1-90 forecast rows required");

    const rows = forecast.map((row) => ({
      organization_id: access.organizationId,
      property_id: propertyId,
      forecast_date: forecastDate,
      stay_date: clean(row.stayDate),
      rooms_available: Number(row.roomsAvailable || 0),
      rooms_sold: Number(row.roomsSold || 0),
      occupancy_percent: Number(row.occupancyPercent || 0),
      room_revenue: Number(row.roomRevenue || 0),
      adr: Number(row.adr || 0),
      revpar: Number(row.revpar || 0),
      source: "SYSTEM",
    }));
    const { data, error } = await supabaseAdmin.from("hotel_forecast_snapshots").upsert(rows, { onConflict: "organization_id,property_id,forecast_date,stay_date,source" }).select();
    if (error) throw error;
    return NextResponse.json({ success: true, snapshots: data || [] });
  } catch (error) {
    console.error("HOTEL_REVENUE_FORECAST_SNAPSHOT_ERROR", error);
    return fail(error?.message || "Unable to snapshot hotel forecast", 500);
  }
}
