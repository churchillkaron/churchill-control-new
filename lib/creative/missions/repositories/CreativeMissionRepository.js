import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_missions";

export const CreativeMissionRepository = {
  async list({ organization_id, workspace_id } = {}) {
    let query = supabaseAdmin
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (organization_id) {
      query = query.eq("organization_id", organization_id);
    }

    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
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

    return data;
  },

  async create(document) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(document)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },

  async update(id, patch) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return data;
  },
};
