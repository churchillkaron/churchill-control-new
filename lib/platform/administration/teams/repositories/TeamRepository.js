import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getTeams(
  organization_id
) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("organization_id", organization_id)
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];

}

export async function createTeam(payload) {

  const { data, error } = await supabaseAdmin
    .from("teams")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data;

}

export async function updateTeam(id, payload) {

  const { data, error } = await supabaseAdmin
    .from("teams")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;

}

export async function archiveTeam(id) {

  const { error } = await supabaseAdmin
    .from("teams")
    .update({
      status: "ARCHIVED"
    })
    .eq("id", id);

  if (error) throw error;

}
