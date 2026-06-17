import { supabase } from "@/lib/shared/supabase/client";

export async function createRoom({
  organizationId,
  roomNumber,
  roomType,
  floor = null,
  maxGuests = 2,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!roomNumber) throw new Error("roomNumber required");
  if (!roomType) throw new Error("roomType required");

  const { data, error } = await supabase
    .from("hotel_rooms")
    .insert({
      organization_id: organizationId,
      room_number: roomNumber,
      room_type: roomType,
      floor: floor,
      max_guests: maxGuests,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
