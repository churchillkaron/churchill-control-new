import { supabase } from "@/lib/shared/supabase/client";

export async function createBooking({
  organizationId,
  roomId,
  guestId,
  checkInDate,
  checkOutDate,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!roomId) throw new Error("roomId required");
  if (!guestId) throw new Error("guestId required");
  if (!checkInDate) throw new Error("checkInDate required");
  if (!checkOutDate) throw new Error("checkOutDate required");

  const { data: overlapping } = await supabase
    .from("hotel_bookings")
    .select("id")
    .eq("room_id", roomId)
    .in("status", ["RESERVED", "CHECKED_IN"]);

  if (overlapping && overlapping.length > 0) throw new Error("Room already booked");

  const { data, error } = await supabase
    .from("hotel_bookings")
    .insert({
      organization_id: organizationId,
      room_id: roomId,
      guest_id: guestId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      status: "RESERVED",
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
