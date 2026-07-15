import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getBusinessLocations(organization_id) {
  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .select("*")
    .eq("organization_id", organization_id)
    .order("name");

  if (error) throw error;

  return data || [];
}

export async function createBusinessLocation(payload) {

  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data;

}

export async function updateBusinessLocation(id, payload) {

  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;

}

export async function archiveBusinessLocation(id) {

  const { error } = await supabaseAdmin
    .from("business_locations")
    .update({
      status: "ARCHIVED"
    })
    .eq("id", id);

  if (error) throw error;

}
