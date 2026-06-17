import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getActiveOrganization } from "@/lib/workspace/getActiveOrganization";
import { checkAvailability } from "@/lib/hotel/checkAvailability";

export async function POST(req) {
  const body = await req.json();
  const supabase = createServerSupabase(req);
  const organization = await getActiveOrganization(body.organizationId);

  if (!organization)
    return new Response(JSON.stringify({ error: "Organization not found" }), { status: 400 });

  const isAvailable = await checkAvailability({
    supabase,
    propertyId: body.propertyId,
    roomId: body.roomId,
    check_in_date: body.check_in_date,
    check_out_date: body.check_out_date,
    organizationId: organization.id,
  });

  if (!isAvailable)
    return new Response(JSON.stringify({ error: "Room is not available for the selected dates" }), { status: 400 });

  const { data, error } = await supabase
    .from("hotel_bookings")
    .insert([{
      organization_id: organization.id,
      
      room_id: body.roomId,
      guest_id: body.guestId,
      check_in_date: body.check_in_date,
      check_out_date: body.check_out_date,
      status: "RESERVED"
    }])
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify(data), { status: 200 });
}
