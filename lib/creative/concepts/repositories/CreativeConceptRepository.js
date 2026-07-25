import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_concepts";

export const CreativeConceptRepository = {
  async list({ organization_id, creative_mission_id = null, creative_project_id = null } = {}) {
    if (!organization_id) throw new Error("organization_id required");

    let query = supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at");

    if (creative_mission_id) {
      query = query.eq("creative_mission_id", creative_mission_id);
    }
    if (creative_project_id) {
      query = query.eq("creative_project_id", creative_project_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async get(id) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  },

  async create(document) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(document)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id, values = {}) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
