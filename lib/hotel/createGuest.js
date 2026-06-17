import { supabase } from "@/lib/shared/supabase/client";

export async function createGuest({
  organizationId,
  firstName,
  lastName = null,
  email = null,
  phone = null,
  nationality = null,
  passportNumber = null,
  dateOfBirth = null,
  vipStatus = false,
  notes = null
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!firstName) throw new Error("firstName required");

  const { data, error } = await supabase
    .from("hotel_guests")
    .insert({
      organization_id: organizationId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      nationality,
      passport_number: passportNumber,
      date_of_birth: dateOfBirth,
      vip_status: vipStatus,
      notes
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
