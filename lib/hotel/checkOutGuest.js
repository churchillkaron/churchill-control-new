import { supabase } from "@/lib/shared/supabase/client";

export async function checkOutGuest({ bookingId }) {
  if (!bookingId) throw new Error("bookingId required");

  const { data: booking, error: bookingError } = await supabase
    .from("hotel_bookings")
    .select("*")
    .eq("id", bookingId)
    .single();

  if (bookingError) throw bookingError;

  const { data, error } = await supabase
    .from("hotel_bookings")
    .update({ status: "CHECKED_OUT", updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("hotel_rooms")
    .update({ status: "DIRTY", updated_at: new Date().toISOString() })
    .eq("id", booking.room_id);

  await supabase
    .from("hotel_housekeeping_tasks")
    .insert({
      organization_id: booking.organization_id,
      room_id: booking.room_id,
      task_type: "CLEANING",
      task_task_status: "PENDING",
      scheduled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

  await checkoutTimeline({ tenantId: booking.organization_id, booking });
  return data;
}
