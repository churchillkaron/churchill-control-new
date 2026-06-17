import { supabase }
  from "@/lib/shared/supabase/client";

export async function createProperty({
  organizationId,
  name,
  address = null,
  city = null,
  country = null,
}) {

  if (!organizationId)
    throw new Error(
      "organizationId required"
    );

  if (!name)
    throw new Error(
      "Property name required"
    );

  const {
    data,
    error,
  } = await supabase
    .from("hotel_properties")
    .insert({
      organization_id:
        organizationId,

      name,

      address,

      city,

      country,
    })
    .select()
    .single();

  if (error)
    throw error;

  return data;

}
