import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_timeline_clips";

export async function create(clip) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(clip)
      .select()
      .single();

  if (error) throw error;

  return data;

}

export async function update(id, values) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update({

        ...values,

        updated_at:
          new Date().toISOString(),

      })
      .eq("id", id)
      .select()
      .single();

  if (error) throw error;

  return data;

}

export async function listByTimeline(timeline_id) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("timeline_id", timeline_id)
      .order("start_seconds");

  if (error) throw error;

  return data || [];

}
