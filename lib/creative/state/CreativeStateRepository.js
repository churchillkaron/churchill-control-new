import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_project_state";
const ACTIVE_PRODUCTION_STAGES = [
  "PRODUCING",
  "RENDERING",
  "REVIEWING",
  "MONITORING",
];

export async function get(creative_mission_id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("creative_mission_id", creative_mission_id)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function listActiveProduction({ limit = 12 } = {}) {
  const boundedLimit = Math.max(1, Math.min(50, Number(limit || 12)));
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .in("stage", ACTIVE_PRODUCTION_STAGES)
    .eq("execution_lock", false)
    .order("updated_at", { ascending: true })
    .limit(boundedLimit);

  if (error) throw error;
  return data || [];
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

export const CreativeStateRepository = {
  get,
  listActiveProduction,
  upsert,
};
