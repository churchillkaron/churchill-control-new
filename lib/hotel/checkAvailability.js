export async function checkAvailability({
  supabase,
  roomId,
  check_in_date,
  check_out_date,
  organizationId,
}) {
  const { data, error } = await supabase
    .from("hotel_bookings")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("room_id", roomId)
    .lt("check_in_date", check_out_date)
    .gt("check_out_date", check_in_date);

  if (error) throw error;

  return (data || []).length === 0;
}
