import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });
const ACTIVE_BOOKING_STATUSES = new Set(["RESERVED", "CHECKED_IN", "CHECKED_OUT"]);
const OPEN_GROUP_STATUSES = new Set(["PROSPECT", "TENTATIVE", "CONFIRMED", "IN_HOUSE"]);

function isoDate(value) {
  return clean(value).slice(0, 10);
}

function datesBetween(from, to) {
  if (!from || !to || to <= from) return [];
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor < end && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function requireProperty(organizationId, propertyId) {
  const { data, error } = await supabaseAdmin
    .from("hotel_properties")
    .select("id,name")
    .eq("organization_id", organizationId)
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Property not found"), { status: 404 });
  return data;
}

async function requireGroup(organizationId, groupId) {
  const { data, error } = await supabaseAdmin
    .from("hotel_groups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Group not found"), { status: 404 });
  return data;
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);

    let groupQuery = supabaseAdmin
      .from("hotel_groups")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("arrival_date", { ascending: true });
    if (propertyId) groupQuery = groupQuery.eq("property_id", propertyId);

    const [groupsResult, blocksResult, bookingsResult, roomsResult, guestsResult, ratePlansResult] = await Promise.all([
      groupQuery,
      propertyId
        ? supabaseAdmin.from("hotel_group_room_blocks").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("stay_date")
        : supabaseAdmin.from("hotel_group_room_blocks").select("*").eq("organization_id", access.organizationId).order("stay_date"),
      propertyId
        ? supabaseAdmin.from("hotel_bookings").select("id,property_id,group_id,guest_id,room_id,booking_reference,check_in_date,check_out_date,status,total_amount,currency_code").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("check_in_date")
        : supabaseAdmin.from("hotel_bookings").select("id,property_id,group_id,guest_id,room_id,booking_reference,check_in_date,check_out_date,status,total_amount,currency_code").eq("organization_id", access.organizationId).order("check_in_date"),
      propertyId
        ? supabaseAdmin.from("hotel_rooms").select("id,property_id,room_number,room_type,status").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("room_number")
        : supabaseAdmin.from("hotel_rooms").select("id,property_id,room_number,room_type,status").eq("organization_id", access.organizationId).order("room_number"),
      supabaseAdmin.from("hotel_guests").select("id,full_name,email,phone").eq("organization_id", access.organizationId).order("full_name"),
      propertyId
        ? supabaseAdmin.from("hotel_rate_plans").select("id,property_id,name,code,currency_code,active").eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("active", true).order("name")
        : supabaseAdmin.from("hotel_rate_plans").select("id,property_id,name,code,currency_code,active").eq("organization_id", access.organizationId).eq("active", true).order("name"),
    ]);
    for (const result of [groupsResult, blocksResult, bookingsResult, roomsResult, guestsResult, ratePlansResult]) {
      if (result.error) throw result.error;
    }

    const rooms = roomsResult.data || [];
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const bookings = bookingsResult.data || [];
    const blocks = (blocksResult.data || []).map((block) => {
      const pickedUp = bookings.filter((booking) => {
        if (booking.group_id !== block.group_id || !ACTIVE_BOOKING_STATUSES.has(String(booking.status || "").toUpperCase())) return false;
        const room = roomById.get(booking.room_id);
        return room?.room_type === block.room_type && booking.check_in_date <= block.stay_date && booking.check_out_date > block.stay_date;
      }).length;
      return { ...block, picked_up: pickedUp, remaining: Math.max(0, Number(block.allocated_rooms || 0) - pickedUp) };
    });

    return NextResponse.json({
      success: true,
      groups: groupsResult.data || [],
      blocks,
      bookings,
      rooms,
      guests: guestsResult.data || [],
      ratePlans: ratePlansResult.data || [],
    });
  } catch (error) {
    console.error("HOTEL_GROUP_LIST_ERROR", error);
    return fail(error?.message || "Unable to load groups", error?.status || 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const propertyId = clean(body.propertyId || body.property_id);
    const action = clean(body.action || "CREATE").toUpperCase();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);

    if (action === "CREATE") {
      const name = clean(body.name);
      if (!propertyId || !name) return fail("Property and group name required");
      await requireProperty(access.organizationId, propertyId);
      const arrivalDate = isoDate(body.arrivalDate || body.arrival_date) || null;
      const departureDate = isoDate(body.departureDate || body.departure_date) || null;
      if (arrivalDate && departureDate && departureDate <= arrivalDate) return fail("Departure must be after arrival");
      const roomBlock = Math.max(0, Number.parseInt(body.roomBlock || body.room_block || 0, 10));
      const status = clean(body.status || "PROSPECT").toUpperCase();
      if (!OPEN_GROUP_STATUSES.has(status)) return fail("New groups must start as PROSPECT, TENTATIVE, CONFIRMED or IN_HOUSE");
      const ratePlanId = clean(body.ratePlanId || body.negotiatedRatePlanId || body.negotiated_rate_plan_id) || null;
      if (ratePlanId) {
        const { data: plan, error: planError } = await supabaseAdmin.from("hotel_rate_plans").select("id,property_id,active").eq("organization_id", access.organizationId).eq("id", ratePlanId).maybeSingle();
        if (planError) throw planError;
        if (!plan || !plan.active || plan.property_id !== propertyId) return fail("Negotiated rate plan is not active for this property", 409);
      }
      const payload = {
        organization_id: access.organizationId,
        property_id: propertyId,
        name,
        group_code: clean(body.groupCode || body.group_code) || null,
        contact_guest_id: clean(body.contactGuestId || body.contact_guest_id) || null,
        arrival_date: arrivalDate,
        departure_date: departureDate,
        cutoff_date: isoDate(body.cutoffDate || body.cutoff_date) || null,
        block_mode: clean(body.blockMode || body.block_mode || "DEDUCT").toUpperCase(),
        negotiated_rate_plan_id: ratePlanId,
        status,
        room_block: roomBlock,
        notes: clean(body.notes) || null,
        status_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin.from("hotel_groups").insert(payload).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, group: data });
    }

    const groupId = clean(body.groupId || body.group_id);
    if (!groupId) return fail("groupId required");
    const group = await requireGroup(access.organizationId, groupId);
    if (propertyId && group.property_id !== propertyId) return fail("Group belongs to another property", 409);

    if (action === "UPDATE_STATUS") {
      const status = clean(body.status).toUpperCase();
      const allowed = new Set(["PROSPECT", "TENTATIVE", "CONFIRMED", "IN_HOUSE", "COMPLETED", "CANCELLED", "LOST"]);
      if (!allowed.has(status)) return fail("Unsupported group status");
      if (["CANCELLED", "LOST"].includes(status)) {
        const { error: releaseError } = await supabaseAdmin
          .from("hotel_group_room_blocks")
          .update({ status: "RELEASED", updated_at: new Date().toISOString() })
          .eq("organization_id", access.organizationId)
          .eq("group_id", group.id)
          .eq("status", "ACTIVE");
        if (releaseError) throw releaseError;
      }
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin.from("hotel_groups").update({ status, status_updated_at: now, updated_at: now }).eq("organization_id", access.organizationId).eq("id", group.id).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, group: data });
    }

    if (action === "UPSERT_BLOCK_RANGE") {
      if (!OPEN_GROUP_STATUSES.has(String(group.status || "").toUpperCase())) return fail("Closed, lost or cancelled groups cannot hold room inventory", 409);
      const roomType = clean(body.roomType || body.room_type);
      const from = isoDate(body.from || body.arrivalDate || group.arrival_date);
      const to = isoDate(body.to || body.departureDate || group.departure_date);
      const stayDates = datesBetween(from, to);
      const allocatedRooms = Number.parseInt(body.allocatedRooms ?? body.allocated_rooms ?? 0, 10);
      const negotiatedRateRaw = body.negotiatedRate ?? body.negotiated_rate;
      const negotiatedRate = negotiatedRateRaw === "" || negotiatedRateRaw == null ? null : Number(negotiatedRateRaw);
      const deductInventory = body.deductInventory ?? body.deduct_inventory ?? String(group.block_mode || "DEDUCT").toUpperCase() === "DEDUCT";
      if (!roomType || !stayDates.length) return fail("Room type and a valid stay date range are required");
      if (!Number.isInteger(allocatedRooms) || allocatedRooms < 0) return fail("Allocated rooms must be zero or greater");
      if (negotiatedRate !== null && (!Number.isFinite(negotiatedRate) || negotiatedRate < 0)) return fail("Negotiated rate must be zero or greater");

      const { data: physicalRooms, error: roomError } = await supabaseAdmin
        .from("hotel_rooms")
        .select("id")
        .eq("organization_id", access.organizationId)
        .eq("property_id", group.property_id)
        .eq("room_type", roomType);
      if (roomError) throw roomError;
      const physicalCount = (physicalRooms || []).length;
      if (!physicalCount) return fail("No physical rooms exist for this room type", 409);

      if (deductInventory && allocatedRooms > 0) {
        const { data: otherBlocks, error: blockError } = await supabaseAdmin
          .from("hotel_group_room_blocks")
          .select("group_id,stay_date,allocated_rooms")
          .eq("organization_id", access.organizationId)
          .eq("property_id", group.property_id)
          .eq("room_type", roomType)
          .eq("deduct_inventory", true)
          .eq("status", "ACTIVE")
          .gte("stay_date", stayDates[0])
          .lte("stay_date", stayDates[stayDates.length - 1]);
        if (blockError) throw blockError;
        for (const stayDate of stayDates) {
          const heldElsewhere = (otherBlocks || []).filter((block) => block.group_id !== group.id && block.stay_date === stayDate).reduce((sum, block) => sum + Number(block.allocated_rooms || 0), 0);
          if (heldElsewhere + allocatedRooms > physicalCount) {
            return fail(`${roomType} allocation exceeds physical inventory on ${stayDate}: ${heldElsewhere} already held, ${physicalCount} rooms exist`, 409);
          }
        }
      }

      const currencyCode = clean(body.currencyCode || body.currency_code || "THB").toUpperCase();
      const now = new Date().toISOString();
      const rows = stayDates.map((stayDate) => ({
        organization_id: access.organizationId,
        property_id: group.property_id,
        group_id: group.id,
        room_type: roomType,
        stay_date: stayDate,
        allocated_rooms: allocatedRooms,
        negotiated_rate: negotiatedRate,
        currency_code: currencyCode,
        deduct_inventory: Boolean(deductInventory),
        status: allocatedRooms > 0 ? "ACTIVE" : "RELEASED",
        updated_at: now,
      }));
      const { data, error } = await supabaseAdmin.from("hotel_group_room_blocks").upsert(rows, { onConflict: "organization_id,group_id,room_type,stay_date" }).select();
      if (error) throw error;
      const totalBlock = Math.max(0, ...rows.map((row) => Number(row.allocated_rooms || 0)));
      await supabaseAdmin.from("hotel_groups").update({ room_block: totalBlock, updated_at: now }).eq("organization_id", access.organizationId).eq("id", group.id);
      return NextResponse.json({ success: true, blocks: data || [], days: rows.length, physicalInventory: physicalCount });
    }

    if (action === "LINK_BOOKING") {
      const bookingId = clean(body.bookingId || body.booking_id);
      if (!bookingId) return fail("bookingId required");
      if (!OPEN_GROUP_STATUSES.has(String(group.status || "").toUpperCase())) return fail("Group is not open for reservation pickup", 409);
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from("hotel_bookings")
        .select("id,property_id,group_id,check_in_date,check_out_date,status")
        .eq("organization_id", access.organizationId)
        .eq("id", bookingId)
        .maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) return fail("Reservation not found", 404);
      if (booking.property_id !== group.property_id) return fail("Reservation belongs to another property", 409);
      if (booking.group_id && booking.group_id !== group.id) return fail("Reservation already belongs to another group", 409);
      if (group.arrival_date && booking.check_out_date <= group.arrival_date) return fail("Reservation is outside the group stay window", 409);
      if (group.departure_date && booking.check_in_date >= group.departure_date) return fail("Reservation is outside the group stay window", 409);
      const { data, error } = await supabaseAdmin.from("hotel_bookings").update({ group_id: group.id, source: "GROUP", updated_at: new Date().toISOString() }).eq("organization_id", access.organizationId).eq("id", booking.id).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, booking: data });
    }

    return fail("Unsupported group action");
  } catch (error) {
    console.error("HOTEL_GROUP_ACTION_ERROR", error);
    return fail(error?.message || "Unable to update group", error?.status || 500);
  }
}
