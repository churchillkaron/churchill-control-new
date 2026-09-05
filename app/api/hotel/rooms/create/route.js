import { NextResponse } from "next/server";

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
    if (!organizationId) return errorResponse("organizationId required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const propertyId = cleanValue(body.propertyId || body.property_id);
    const roomNumber = cleanValue(body.roomNumber || body.room_number);
    const roomType = cleanValue(body.roomType || body.room_type);
    if (!propertyId) return errorResponse("propertyId required", 400);
    if (!roomNumber) return errorResponse("roomNumber required", 400);
    if (!roomType) return errorResponse("roomType required", 400);

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("hotel_properties")
      .select("id")
      .eq("id", propertyId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return errorResponse("Property not found", 404);

    const { data, error } = await supabaseAdmin
      .from("hotel_rooms")
      .insert({
        organization_id: access.organizationId,
        property_id: propertyId,
        room_number: roomNumber,
        room_type: roomType,
        floor: cleanValue(body.floor ?? body.floorNumber),
        base_rate: Number(body.baseRate ?? body.base_rate ?? 0),
        max_guests: Number(body.maxGuests ?? body.max_guests ?? 2),
        notes: cleanValue(body.notes),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, room: data });
  } catch (error) {
    console.error("HOTEL_ROOM_CREATE_ERROR", error);
    return errorResponse(error?.message || "Room creation failed");
  }
}
