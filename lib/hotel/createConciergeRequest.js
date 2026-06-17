import { supabase } from "@/lib/shared/supabase/client";

export async function createConciergeRequest({
  organizationId,
  propertyId,
  guestId,
  requestType,
  details = null,
  status = "PENDING",
}) {

  if (!organizationId)
    throw new Error("organizationId required");

  if (!propertyId)
    throw new Error("propertyId required");

  if (!guestId)
    throw new Error("guestId required");

  if (!requestType)
    throw new Error("requestType required");

  const {
    data,
    error,
  } = await supabase
    .from("hotel_concierge_requests")
    .insert({
      organization_id:
        organizationId,

      property_id:
        propertyId,

      guest_id:
        guestId,

      request_type:
        requestType,

      details,

      status,
    })
    .select()
    .single();

  if (error)
    throw error;

  return data;

}
