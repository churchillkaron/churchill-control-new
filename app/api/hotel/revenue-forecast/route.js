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

    const [roomsResult, bookingsResult, blocksResult] = await Promise.all([
      supabaseAdmin
        .from("hotel_rooms")
        .select("id,status,room_type")
        .eq("organization_id", access.organizationId)
        .eq("property_id", propertyId),
      supabaseAdmin
        .from("hotel_bookings")
        .select("id,status,group_id,room_id,check_in_date,check_out_date,total_amount,currency_code,source,channel_connection_id")
        .eq("organization_id", access.organizationId)
        .eq("property_id", propertyId)
        .lt("check_in_date", to)
        .gt("check_out_date", from)
        .in("status", ["RESERVED", "CHECKED_IN"]),
      supabaseAdmin
        .from("hotel_group_room_blocks")
        .select("id,group_id,room_type,stay_date,allocated_rooms,negotiated_rate,currency_code,deduct_inventory,status")
        .eq("organization_id", access.organizationId)
        .eq("property_id", propertyId)
        .eq("status", "ACTIVE")
        .gte("stay_date", from)
        .lt("stay_date", to)
        .order("stay_date"),
    ]);
    if (roomsResult.error) throw roomsResult.error;
    if (bookingsResult.error) throw bookingsResult.error;
    if (blocksResult.error) throw blocksResult.error;

    const rooms = roomsResult.data || [];
    const bookings = bookingsResult.data || [];
    const blocks = blocksResult.data || [];
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const roomsAvailable = rooms.filter((room) => !["OUT_OF_SERVICE", "BLOCKED"].includes(String(room.status || "").toUpperCase())).length;
    const forecast = [];

    for (let offset = 0; offset < days; offset += 1) {
      const stayDate = addDays(from, offset);
      const active = bookings.filter((booking) => booking.check_in_date <= stayDate && booking.check_out_date > stayDate);
      const roomsSold = active.length;
      const roomRevenue = active.reduce((sum, booking) => sum + Number(booking.total_amount || 0) / nightsBetween(booking.check_in_date, booking.check_out_date), 0);

      const activeBlocks = blocks.filter((block) => block.stay_date === stayDate && block.deduct_inventory);
      let groupRoomsHeld = 0;
      let groupPickupRooms = 0;
      let groupHeldRevenue = 0;
      let groupBlocks = 0;

      for (const block of activeBlocks) {
        const pickup = active.filter((booking) => {
          if (booking.group_id !== block.group_id) return false;
          return roomById.get(booking.room_id)?.room_type === block.room_type;
        }).length;
        const remaining = Math.max(0, Number(block.allocated_rooms || 0) - pickup);
        groupPickupRooms += pickup;
        groupRoomsHeld += remaining;
        groupBlocks += 1;
        if (block.negotiated_rate != null) groupHeldRevenue += remaining * Number(block.negotiated_rate || 0);
      }

      const committedRooms = Math.min(roomsAvailable, roomsSold + groupRoomsHeld);
      const occupancyPercent = roomsAvailable ? (roomsSold / roomsAvailable) * 100 : 0;
      const committedOccupancyPercent = roomsAvailable ? (committedRooms / roomsAvailable) * 100 : 0;
      const adr = roomsSold ? roomRevenue / roomsSold : 0;
      const revpar = roomsAvailable ? roomRevenue / roomsAvailable : 0;
      const potentialRoomRevenue = roomRevenue + groupHeldRevenue;
      const potentialRevpar = roomsAvailable ? potentialRoomRevenue / roomsAvailable : 0;

      forecast.push({
        stayDate,
        roomsAvailable,
        roomsSold,
        groupRoomsHeld,
        groupPickupRooms,
        groupBlocks,
        committedRooms,
        occupancyPercent: Number(occupancyPercent.toFixed(2)),
        committedOccupancyPercent: Number(committedOccupancyPercent.toFixed(2)),
        roomRevenue: Number(roomRevenue.toFixed(2)),
        groupHeldRevenue: Number(groupHeldRevenue.toFixed(2)),
        potentialRoomRevenue: Number(potentialRoomRevenue.toFixed(2)),
        adr: Number(adr.toFixed(2)),
        revpar: Number(revpar.toFixed(2)),
        potentialRevpar: Number(potentialRevpar.toFixed(2)),
      });
    }

    const totals = {
      availableRoomNights: forecast.reduce((sum, row) => sum + row.roomsAvailable, 0),
      soldRoomNights: forecast.reduce((sum, row) => sum + row.roomsSold, 0),
      groupHeldRoomNights: forecast.reduce((sum, row) => sum + row.groupRoomsHeld, 0),
      groupPickupRoomNights: forecast.reduce((sum, row) => sum + row.groupPickupRooms, 0),
      committedRoomNights: forecast.reduce((sum, row) => sum + row.committedRooms, 0),
      roomRevenue: Number(forecast.reduce((sum, row) => sum + row.roomRevenue, 0).toFixed(2)),
      groupHeldRevenue: Number(forecast.reduce((sum, row) => sum + row.groupHeldRevenue, 0).toFixed(2)),
      potentialRoomRevenue: Number(forecast.reduce((sum, row) => sum + row.potentialRoomRevenue, 0).toFixed(2)),
    };
    totals.occupancyPercent = totals.availableRoomNights ? Number(((totals.soldRoomNights / totals.availableRoomNights) * 100).toFixed(2)) : 0;
    totals.committedOccupancyPercent = totals.availableRoomNights ? Number(((totals.committedRoomNights / totals.availableRoomNights) * 100).toFixed(2)) : 0;
    totals.adr = totals.soldRoomNights ? Number((totals.roomRevenue / totals.soldRoomNights).toFixed(2)) : 0;
    totals.revpar = totals.availableRoomNights ? Number((totals.roomRevenue / totals.availableRoomNights).toFixed(2)) : 0;
    totals.potentialRevpar = totals.availableRoomNights ? Number((totals.potentialRoomRevenue / totals.availableRoomNights).toFixed(2)) : 0;

    const currencyCode = bookings[0]?.currency_code || blocks.find((block) => block.currency_code)?.currency_code || "THB";
    return NextResponse.json({ success: true, from, days, currencyCode, forecast, totals });
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
