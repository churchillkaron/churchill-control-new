import { NextResponse } from "next/server";

import { getGroupInventoryProtection, getOwnGroupBlockCapacity } from "@/lib/hotel/getGroupInventoryProtection";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(body.organizationId || body.organization_id);
    const requestedPropertyId = cleanValue(body.propertyId || body.property_id);
    const groupId = cleanValue(body.groupId || body.group_id);
    const checkInDate = cleanValue(body.checkInDate || body.check_in_date);
    const checkOutDate = cleanValue(body.checkOutDate || body.check_out_date);

    if (!organizationId) return errorResponse("organizationId required", 400);
    if (!checkInDate || !checkOutDate) return errorResponse("checkInDate and checkOutDate required", 400);
    if (checkOutDate <= checkInDate) return errorResponse("checkOutDate must be after checkInDate", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    let group = null;
    if (groupId) {
      const { data, error: groupError } = await supabaseAdmin
        .from("hotel_groups")
        .select("id,property_id,status")
        .eq("organization_id", access.organizationId)
        .eq("id", groupId)
        .maybeSingle();
      if (groupError) throw groupError;
      group = data;
      if (!group) return errorResponse("Group not found", 404);
      if (requestedPropertyId && group.property_id !== requestedPropertyId) return errorResponse("Group belongs to another property", 409);
      if (["CANCELLED", "LOST", "COMPLETED"].includes(String(group.status || "").toUpperCase())) return errorResponse("Group is not open for reservation pickup", 409);
    }

    const effectivePropertyId = group?.property_id || requestedPropertyId;

    let roomsQuery = supabaseAdmin
      .from("hotel_rooms")
      .select("*")
      .eq("organization_id", access.organizationId)
      .not("property_id", "is", null)
      .neq("status", "OUT_OF_SERVICE")
      .order("room_number", { ascending: true });
    let bookingsQuery = supabaseAdmin
      .from("hotel_bookings")
      .select("room_id,property_id")
      .eq("organization_id", access.organizationId)
      .in("status", ["RESERVED", "CHECKED_IN"])
      .lt("check_in_date", checkOutDate)
      .gt("check_out_date", checkInDate);
    if (effectivePropertyId) {
      roomsQuery = roomsQuery.eq("property_id", effectivePropertyId);
      bookingsQuery = bookingsQuery.eq("property_id", effectivePropertyId);
    }

    const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }] = await Promise.all([roomsQuery, bookingsQuery]);
    if (roomsError) throw roomsError;
    if (bookingsError) throw bookingsError;

    const unavailableRoomIds = new Set((bookings || []).map((booking) => booking.room_id).filter(Boolean));
    const freeRooms = (rooms || []).filter((room) => !unavailableRoomIds.has(room.id));
    const propertyIds = [...new Set(freeRooms.map((room) => room.property_id).filter(Boolean))];

    const protectionEntries = await Promise.all(propertyIds.map(async (currentPropertyId) => [
      currentPropertyId,
      await getGroupInventoryProtection({
        supabase: supabaseAdmin,
        organizationId: access.organizationId,
        propertyId: currentPropertyId,
        checkInDate,
        checkOutDate,
        excludeGroupId: groupId,
      }),
    ]));
    const protectionByProperty = new Map(protectionEntries);

    const availableRooms = [];
    for (const currentPropertyId of propertyIds) {
      const propertyRooms = freeRooms.filter((room) => room.property_id === currentPropertyId);
      const roomTypes = [...new Set(propertyRooms.map((room) => room.room_type).filter(Boolean))];
      const protection = protectionByProperty.get(currentPropertyId);

      for (const roomType of roomTypes) {
        const candidates = propertyRooms.filter((room) => room.room_type === roomType);
        const withheld = Number(protection?.withheldByRoomType?.[roomType] || 0);
        let exposeCount = Math.max(0, candidates.length - withheld);

        if (groupId) {
          const ownBlock = getOwnGroupBlockCapacity({
            remainingBlocks: protection?.remainingBlocks || [],
            groupId,
            roomType,
            dates: protection?.dates || [],
          });
          if (ownBlock.hasDeductBlock) exposeCount = ownBlock.complete ? Math.min(exposeCount, Math.max(0, ownBlock.minRemaining)) : 0;
        }

        availableRooms.push(...candidates.slice(0, exposeCount));
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      propertyId: effectivePropertyId || null,
      groupId: groupId || null,
      checkInDate,
      checkOutDate,
      rooms: availableRooms,
      inventoryProtection: propertyIds.map((currentPropertyId) => ({
        propertyId: currentPropertyId,
        withheldByRoomType: protectionByProperty.get(currentPropertyId)?.withheldByRoomType || {},
      })),
    });
  } catch (error) {
    console.error("HOTEL_AVAILABILITY_ERROR", error);
    return errorResponse(error?.message || "Availability lookup failed");
  }
}
