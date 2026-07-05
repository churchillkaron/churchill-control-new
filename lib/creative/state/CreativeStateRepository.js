import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_project_state";

export async function get(project_id) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("project_id", project_id)
      .single();

  if (error) return null;

  return data;

}

export async function upsert(state) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .upsert(state)
      .select()
      .single();

  if (error) throw error;

  return data;

}
