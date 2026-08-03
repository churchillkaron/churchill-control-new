import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_project_state";

export async function get(creative_mission_id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("creative_mission_id", creative_mission_id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insert(state) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(state)
    .select()
    .single();

  if (error) throw error;
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

export async function compareAndSwapExecutionLock({
  creative_mission_id,
  expected_execution_lock,
  expected_locked_at,
  values,
}) {
  if (!creative_mission_id) {
    throw new Error("creative_mission_id required");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("creative_mission_id", creative_mission_id)
    .eq("execution_lock", expected_execution_lock === true);

  query = expected_locked_at
    ? query.eq("locked_at", expected_locked_at)
    : query.is("locked_at", null);

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}
