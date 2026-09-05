import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const roomId = clean(body.roomId || body.room_id);
    const propertyId = clean(body.propertyId || body.property_id);
    if (!organizationId) return fail("organizationId required");
    if (!roomId) return fail("roomId required");
    if (!propertyId) return fail("propertyId required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);

    const [{ data: property, error: propertyError }, { data: room, error: roomError }] = await Promise.all([
      supabaseAdmin.from("hotel_properties").select("id,name").eq("organization_id", access.organizationId).eq("id", propertyId).maybeSingle(),
      supabaseAdmin.from("hotel_rooms").select("id,property_id,room_number").eq("organization_id", access.organizationId).eq("id", roomId).maybeSingle(),
    ]);
    if (propertyError) throw propertyError;
    if (roomError) throw roomError;
    if (!property) return fail("Property not found", 404);
    if (!room) return fail("Room not found", 404);
    if (room.property_id) {
      if (room.property_id === propertyId) return NextResponse.json({ success: true, room, property, unchanged: true });
      return fail("Room is already bound to a property. Reassignment requires a controlled room-transfer workflow.", 409);
    }

    const changedAt = new Date().toISOString();
    const { data: boundRoom, error: bindError } = await supabaseAdmin
      .from("hotel_rooms")
      .update({ property_id: propertyId, updated_at: changedAt })
      .eq("organization_id", access.organizationId)
      .eq("id", roomId)
      .is("property_id", null)
      .select()
      .maybeSingle();
    if (bindError) throw bindError;
    if (!boundRoom) return fail("Room binding changed before completion. Refresh and retry.", 409);

    const { error: bookingError } = await supabaseAdmin
      .from("hotel_bookings")
      .update({ property_id: propertyId, updated_at: changedAt })
      .eq("organization_id", access.organizationId)
      .eq("room_id", roomId)
      .is("property_id", null);
    if (bookingError) throw bookingError;

    return NextResponse.json({ success: true, room: boundRoom, property });
  } catch (error) {
    console.error("HOTEL_ROOM_PROPERTY_BIND_ERROR", error);
    return fail(error?.message || "Unable to bind room to property", 500);
  }
}
