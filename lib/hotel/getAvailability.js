import { supabase } from "@/lib/shared/supabase/client";

export async function getAvailability({
  organizationId,
  propertyId,
  checkInDate,
  checkOutDate,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!propertyId) throw new Error("propertyId required");
  if (!checkInDate || !checkOutDate) throw new Error("checkInDate and checkOutDate required");

  // Get all rooms for the property
  const { data: rooms, error: roomsError } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("organization_id", organizationId)
    ;

  if (roomsError) throw roomsError;

  const availableRooms = [];

  for (const room of rooms) {
    // Check overlapping bookings
    const { data: bookings, error: bookingError } = await supabase
      .from("hotel_bookings")
      .select("id")
      .eq("room_id", room.id)
      .in("status", ["RESERVED", "CHECKED_IN"])
      .or(
        `check_in_date.lte.${checkOutDate},check_out_date.gte.${checkInDate}`
      );

    if (bookingError) throw bookingError;

    if (!bookings || bookings.length === 0) {
      availableRooms.push(room);
    }
  }

  return availableRooms;
}
