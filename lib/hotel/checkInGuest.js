import { supabase } from "@/lib/shared/supabase/client";

export async function checkInGuest({ bookingId }) {
  if (!bookingId) throw new Error("bookingId required");

  const { data: booking, error: bookingError } = await supabase
    .from("hotel_bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (bookingError) throw bookingError;

  const { data, error } = await supabase
    .from("hotel_bookings")
    .update({
      status: "CHECKED_IN",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("hotel_rooms")
    .update({
      status: "OCCUPIED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.room_id);

  return data;
}
