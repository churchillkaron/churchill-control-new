import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_project_state";

export async function get(creative_mission_id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq(
      "creative_mission_id",
      creative_mission_id,
    )
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function upsert(state) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(state)
    .select()
    .single();

  if (error) throw error;
  return data;
}
