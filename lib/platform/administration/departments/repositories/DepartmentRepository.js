import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getDepartments(
  organization_id
) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("departments")
    .select("*")
    .eq("organization_id", organization_id)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];

}

export async function createDepartment(payload) {

  const { data, error } = await supabaseAdmin
    .from("departments")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data;

}

export async function updateDepartment(id, payload) {

  const { data, error } = await supabaseAdmin
    .from("departments")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;

}

export async function archiveDepartment(id) {

  const { error } = await supabaseAdmin
    .from("departments")
    .update({
      status: "ARCHIVED"
    })
    .eq("id", id);

  if (error) throw error;

}
